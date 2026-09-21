# 08_aggregator: all device configurations

a group HQ (AS 65000) that summarises two subsidiaries with their own AS numbers.

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 08_aggregator import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| SUB-A | e1/0 | HQ-EDGE | e1/0 | 172.16.10.0/30  subsidiary A (AS 65010) to HQ |
| SUB-B | e1/0 | HQ-EDGE | e1/1 | 172.16.20.0/30  subsidiary B (AS 65020) to HQ |
| HQ-EDGE | e1/2 | ISP | e1/0 | 172.16.100.0/30 HQ to provider (AS 65001) |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| SUB-A | subsidiary | 65010 | 192.168.99.11 |
| SUB-B | subsidiary | 65020 | 192.168.99.12 |
| HQ-EDGE | edge | 65000 | 192.168.99.21 |
| ISP | provider | 65001 | 192.168.99.31 |

## HQ-EDGE

```
hostname HQ-EDGE
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
 ip address 192.168.99.21 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to SUB-A (AS 65010) ===
 ip address 172.16.10.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to SUB-B (AS 65020) ===
 ip address 172.16.20.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === eBGP to ISP (AS 65001) ===
 ip address 172.16.100.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.10.1 remote-as 65010
 neighbor 172.16.20.1 remote-as 65020
 neighbor 172.16.100.1 remote-as 65001
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 summary-only
  neighbor 172.16.10.1 activate
  neighbor 172.16.20.1 activate
  neighbor 172.16.100.1 activate
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
 ip address 192.168.99.31 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to HQ-EDGE (AS 65000) ===
 ip address 172.16.100.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65001
 bgp router-id 10.255.1.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.100.2 remote-as 65000
 address-family ipv4
  neighbor 172.16.100.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## SUB-A

```
hostname SUB-A
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65010:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.11 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to HQ-EDGE (AS 65000) ===
 ip address 172.16.10.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Loopback1
 description === subsidiary LAN 10.10.1.0/24 ===
 ip address 10.10.1.1 255.255.255.0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65010
 bgp router-id 10.255.10.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.10.2 remote-as 65000
 address-family ipv4
  network 10.10.1.0 mask 255.255.255.0
  neighbor 172.16.10.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## SUB-B

```
hostname SUB-B
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65020:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.12 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to HQ-EDGE (AS 65000) ===
 ip address 172.16.20.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Loopback1
 description === subsidiary LAN 10.10.2.0/24 ===
 ip address 10.10.2.1 255.255.255.0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65020
 bgp router-id 10.255.20.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.20.2 remote-as 65000
 address-family ipv4
  network 10.10.2.0 mask 255.255.255.0
  neighbor 172.16.20.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `08_aggregator`: AGGREGATOR - summarising two subsidiaries: as-set keeps their AS numbers

HQ-EDGE summarises 10.10.1.0/24 (AS 65010) and 10.10.2.0/24 (AS 65020) into 10.10.0.0/16. Without as-set the summary carries only AS 65000 and the ATOMIC_AGGREGATE flag. With as-set the path keeps {65010,65020}, the flag disappears, AGGREGATOR still names HQ-EDGE, and each subsidiary rejects the summary because its own AS is in it.

Push to: **HQ-EDGE** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 address-family ipv4
  no aggregate-address 10.10.0.0 255.255.0.0 summary-only
  aggregate-address 10.10.0.0 255.255.0.0 as-set summary-only
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no aggregate-address 10.10.0.0 255.255.0.0 as-set summary-only
  aggregate-address 10.10.0.0 255.255.0.0 summary-only
```

**Check the result** (after about 40 s):

- `ISP# show ip bgp 10.10.0.0/16`
- `ISP# show ip bgp 10.10.0.0/16`
- `ISP# show ip bgp 10.10.0.0/16`
- `SUB-A# show ip bgp 10.10.0.0/16`
