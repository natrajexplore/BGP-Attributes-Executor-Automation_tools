# 04_origin: all device configurations

ORIGIN, the difference between network and redistribute

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 04_origin import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| EDGE1 | e1/0 | ISP | e1/0 | 172.16.1.0/30 eBGP |
| EDGE2 | e1/0 | ISP | e1/1 | 172.16.2.0/30 eBGP |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| EDGE1 | edge | 65000 | 192.168.99.111 |
| EDGE2 | edge | 65000 | 192.168.99.112 |
| ISP | provider | 65001 | 192.168.99.131 |

## EDGE1

```
hostname EDGE1
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.111 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to ISP (AS 65001), origin via network ===
 ip address 172.16.1.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
ip route 10.10.0.0 255.255.0.0 Null0
!
router bgp 65000
 bgp router-id 10.255.0.11
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.1.1 remote-as 65001
 address-family ipv4
  network 10.10.0.0 mask 255.255.0.0
  neighbor 172.16.1.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## EDGE2

```
hostname EDGE2
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.112 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to ISP (AS 65001), origin via redistribute ===
 ip address 172.16.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
ip route 10.10.0.0 255.255.0.0 Null0
!
router bgp 65000
 bgp router-id 10.255.0.2
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.2.1 remote-as 65001
 address-family ipv4
  redistribute static
  neighbor 172.16.2.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## ISP

```
hostname ISP
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65001:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.131 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to EDGE1 (AS 65000) ===
 ip address 172.16.1.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to EDGE2 (AS 65000) ===
 ip address 172.16.2.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65001
 bgp router-id 10.255.1.1
 bgp log-neighbor-changes
 bgp bestpath compare-routerid
 no bgp default ipv4-unicast
 neighbor 172.16.1.2 remote-as 65000
 neighbor 172.16.2.2 remote-as 65000
 address-family ipv4
  neighbor 172.16.1.2 activate
  neighbor 172.16.2.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `04_origin`: ORIGIN - normalising a redistributed route changes which edge the ISP prefers

Both edges advertise 10.10.0.0/16. EDGE1 used a network statement (ORIGIN IGP), EDGE2 redistribute static (ORIGIN incomplete), so the ISP prefers EDGE1. 'set origin igp' on EDGE2's redistribution removes the difference and the ISP falls through to the router-ID step, where EDGE2 (10.255.0.2) beats EDGE1 (10.255.0.11).

Push to: **EDGE2** (the same lines on each), in configuration mode.

**Apply**

```
route-map REDIST-STATIC permit 10
 set origin igp
router bgp 65000
 address-family ipv4
  no redistribute static
  redistribute static route-map REDIST-STATIC
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no redistribute static route-map REDIST-STATIC
  redistribute static
no route-map REDIST-STATIC
```

**Check the result** (after about 40 s):

- `ISP# show ip bgp 10.10.0.0/16`
- `ISP# show ip bgp 10.10.0.0/16`

## Commands used to capture the README output

```
ISP# show ip bgp 10.10.0.0/16
EDGE2# show ip bgp 10.10.0.0/16
EDGE2# show running-config | section router bgp
```
