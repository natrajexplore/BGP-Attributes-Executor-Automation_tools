# EVE-NG setup (VMware Workstation + Cisco 7206VXR / c7200)

## 1. Host prep (Windows 11)

* Enable Intel VT-x / AMD-V in UEFI.
* VMware Workstation 17.x. If nodes boot slowly, reduce Windows hypervisor
  contention: Core Isolation / Memory integrity OFF, and (optional, breaks WSL2)
  `bcdedit /set hypervisorlaunchtype off` + reboot.

## 2. EVE-NG VM

* Import the **EVE-NG Community OVA**.
* VM spec: **4 vCPU, 8 GB RAM, 60 GB disk**.
* VM Settings → Processors → check **Virtualize Intel VT-x/EPT** (VM powered off).
* Network adapters:
  * **NIC 1 → `pnet0`** = EVE management. Bridged (or NAT). Used for the web UI,
    SSH to EVE, and the dashboard container.
  * **NIC 2 → `pnet1`** = lab OOB. Attach to a dedicated **host-only VMnet**
    (e.g. `VMnet2`, DHCP off). Becomes **Cloud1** inside EVE and carries the
    router `MGMT` VRF subnet `192.168.99.0/24`.
* First boot: console as `root` / `eve`, set password, hostname, static mgmt IP,
  DNS, then `apt update && apt -y upgrade`, reboot.

## 3. Give the EVE host an IP on the MGMT bridge

So the container (and routers' default route) have a gateway at `192.168.99.1`:

```bash
# /etc/network/interfaces.d/pnet1  (or edit /etc/network/interfaces)
auto pnet1
iface pnet1 inet static
    address 192.168.99.1
    netmask 255.255.255.0
    bridge_ports eth1
    bridge_stp off
```
`ifreload -a` (or reboot). Confirm `ip addr show pnet1` → `192.168.99.1/24`.

## 4. Cisco 7206VXR (c7200 / Dynamips) image

```
/opt/unetlab/addons/dynamips/c7200-adventerprisek9-mz.152-4.S6.image
/opt/unetlab/wrappers/unl_wrapper -a fixpermissions
```
No license file needed. If your image name differs, set it in `inventory.yaml`
(`lab.image`) or pass `--image` to `build_lab.py`.

Node profile used by the generated lab: **NPE-400, 256 MB RAM (512 MB makes the emulated CPU
halt), `PA-8E` in slot 1** → `Fa0/0` (mgmt) + `Ethernet1/0 .. 1/7`. The EVE c7200 template only
offers PA-FE-TX / PA-4E / PA-8E. 8 nodes ≈ 2 GB.

## 5. Build the lab (generate + import)

```bash
python backend/scripts/build_lab.py        # writes labs/bgp-attributes.unl
```

In EVE-NG: **Main page → Import** and upload `labs/bgp-attributes.unl`
(or copy it into `/opt/unetlab/labs/` and `unl_wrapper -a fixpermissions`).
The file defines all 8 c7200 nodes, the 12 point-to-point links and the
`Cloud1` (`pnet1`) management bridge — no manual wiring.

Then **Start all nodes**. On first boot, per node: right-click → **Idle PC**
and pick a value with a low CPU marker (the lab ships `0x606df838`; adjust if
your host CPU sits high). Lab settings → enable **Startup-configuration**.

## 6. One-time SSH bring-up (over the console)

Fresh c7200 nodes have no user, no RSA key, no MGMT IP. Bring the dashboard
container up first (step below), then:

```bash
docker exec -it bgp-attributes-executor python scripts/bootstrap.py
```

It telnets each node's EVE-NG console port and configures the local user, domain
name, RSA key, SSH-only VTY, and `Fa0/0` in VRF `MGMT`. After that every
node answers SSH on its `192.168.99.x` address and you can push full configs:

```bash
docker exec -it bgp-attributes-executor python scripts/push_baseline.py
docker exec -it bgp-attributes-executor python scripts/healthcheck.py
```

## 7. Verify the path before touching the dashboard

```bash
ping 192.168.99.111                 # from the EVE host
ssh lab@192.168.99.111              # EDGE1
#   show ip ospf neighbor
#   show ip bgp summary
#   show ip bgp 100.100.100.0/24   # expect a path via ISP-A and via iBGP
```

## 8. Optional — put the dashboard behind EVE's nginx

`/etc/nginx/sites-enabled/` add:

```nginx
location /bgp/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Connection "";        # keep SSE alive
    proxy_buffering off;
}
```
`nginx -t && systemctl reload nginx` → dashboard at `http://<eve>/bgp/`.
