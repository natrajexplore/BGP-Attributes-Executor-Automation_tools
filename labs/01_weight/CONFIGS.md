# 01_weight: all device configurations

WEIGHT, a branch that breaks out through its own local ISP

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 01_weight import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| SITE-R1 | e1/0 | LOCAL-ISP | e1/0 | 198.51.100.0/30 eBGP, branch to its local ISP |
| SITE-R1 | e1/1 | HQ-EDGE | e1/0 | 10.0.0.0/30 WAN (OSPF, iBGP) |
| HQ-EDGE | e1/1 | INTERNET | e1/1 | 172.16.12.0/30 eBGP, HQ upstream |
| LOCAL-ISP | e1/1 | INTERNET | e1/0 | 192.0.2.0/30 eBGP, local ISP upstream |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| SITE-R1 | branch | 65000 | 192.168.99.11 |
| HQ-EDGE | edge | 65000 | 192.168.99.12 |
| LOCAL-ISP | provider | 64500 | 192.168.99.31 |
| INTERNET | content | 65100 | 192.168.99.32 |

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
interface Loopback0
 ip address 10.255.0.12 255.255.255.255
 ip ospf 1 area 0
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
 description === WAN to SITE-R1 ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to INTERNET (AS 65100) ===
 ip address 172.16.12.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.12
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.12
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 neighbor 172.16.12.1 remote-as 65100
 address-family ipv4
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.11 next-hop-self
  neighbor 172.16.12.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## INTERNET

```
hostname INTERNET
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65100:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === content network ===
 ip address 100.100.100.1 255.255.255.0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.32 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to LOCAL-ISP (AS 64500) ===
 ip address 192.0.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to HQ-EDGE (AS 65000) ===
 ip address 172.16.12.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65100
 bgp router-id 10.255.100.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 192.0.2.1 remote-as 64500
 neighbor 172.16.12.2 remote-as 65000
 address-family ipv4
  network 100.100.100.0 mask 255.255.255.0
  neighbor 192.0.2.1 activate
  neighbor 172.16.12.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## LOCAL-ISP

```
hostname LOCAL-ISP
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 64500:99
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
 description === eBGP to SITE-R1 (AS 65000) ===
 ip address 198.51.100.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to INTERNET (AS 65100) ===
 ip address 192.0.2.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 64500
 bgp router-id 10.255.64.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 198.51.100.2 remote-as 65000
 neighbor 192.0.2.2 remote-as 65100
 address-family ipv4
  neighbor 198.51.100.2 activate
  neighbor 192.0.2.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## SITE-R1

```
hostname SITE-R1
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback0
 ip address 10.255.0.11 255.255.255.255
 ip ospf 1 area 0
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
 description === eBGP to LOCAL-ISP (AS 64500) ===
 ip address 198.51.100.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === WAN to HQ-EDGE ===
 ip address 10.0.0.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.11
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.11
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.12 remote-as 65000
 neighbor 10.255.0.12 update-source Loopback0
 neighbor 198.51.100.1 remote-as 64500
 address-family ipv4
  neighbor 10.255.0.12 activate
  neighbor 10.255.0.12 next-hop-self
  neighbor 198.51.100.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `01_weight`: WEIGHT - the branch exits through its own local ISP

SITE-R1 gives routes from its local ISP weight 300. At baseline it prefers the shorter path through HQ (AS_PATH 65100 versus 64500 65100); weight is checked first, so it now exits locally. The weight stays on SITE-R1: HQ-EDGE is unchanged.

Push to: **SITE-R1** (the same lines on each), in configuration mode.

**Apply**

```
route-map LOCAL-ISP-IN permit 10
 set weight 300
router bgp 65000
 address-family ipv4
  neighbor 198.51.100.1 route-map LOCAL-ISP-IN in
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no neighbor 198.51.100.1 route-map LOCAL-ISP-IN in
no route-map LOCAL-ISP-IN
```

**Check the result** (after about 30 s):

- `SITE-R1# show ip bgp 100.100.100.0/24`
- `HQ-EDGE# show ip bgp 100.100.100.0/24`

## Commands used to capture the README output

```
SITE-R1# show ip bgp 100.100.100.0/24
HQ-EDGE# show ip bgp 100.100.100.0/24
SITE-R1# show ip bgp neighbors 10.255.0.12 advertised-routes
LOCAL-ISP# show ip bgp 100.100.100.0/24
```
