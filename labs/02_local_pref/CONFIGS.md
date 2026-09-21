# 02_local_pref: all device configurations

LOCAL_PREF, a dual-homed enterprise choosing its exit

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 02_local_pref import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| CORE | e1/0 | EDGE1 | e1/0 | 10.0.0.0/30 (OSPF) |
| CORE | e1/1 | EDGE2 | e1/0 | 10.0.0.4/30 (OSPF) |
| EDGE1 | e1/1 | EDGE2 | e1/1 | 10.0.0.8/30 (OSPF) |
| EDGE1 | e1/2 | ISP-A | e1/0 | 172.16.1.0/30 eBGP |
| EDGE2 | e1/2 | ISP-B | e1/0 | 172.16.2.0/30 eBGP |
| ISP-A | e1/1 | CONTENT | e1/0 | 198.51.100.0/30 eBGP |
| ISP-B | e1/1 | CONTENT | e1/1 | 203.0.113.0/30 eBGP |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| CORE | core | 65000 | 192.168.99.21 |
| EDGE1 | edge | 65000 | 192.168.99.11 |
| EDGE2 | edge | 65000 | 192.168.99.12 |
| ISP-A | provider | 65001 | 192.168.99.31 |
| ISP-B | provider | 65002 | 192.168.99.32 |
| CONTENT | content | 65100 | 192.168.99.33 |

## CONTENT

```
hostname CONTENT
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
 ip address 192.168.99.33 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to ISP-A (AS 65001) ===
 ip address 198.51.100.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to ISP-B (AS 65002) ===
 ip address 203.0.113.2 255.255.255.252
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
 neighbor 198.51.100.1 remote-as 65001
 neighbor 203.0.113.1 remote-as 65002
 address-family ipv4
  network 100.100.100.0 mask 255.255.255.0
  neighbor 198.51.100.1 activate
  neighbor 203.0.113.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## CORE

```
hostname CORE
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
 ip address 10.255.0.1 255.255.255.255
 ip ospf 1 area 0
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
 description === to EDGE1 ===
 ip address 10.0.0.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to EDGE2 ===
 ip address 10.0.0.5 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.1
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 neighbor 10.255.0.12 remote-as 65000
 neighbor 10.255.0.12 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.12 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

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
 description === to CORE ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to EDGE2 ===
 ip address 10.0.0.9 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === eBGP to ISP-A (AS 65001) ===
 ip address 172.16.1.2 255.255.255.252
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
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor 10.255.0.12 remote-as 65000
 neighbor 10.255.0.12 update-source Loopback0
 neighbor 172.16.1.1 remote-as 65001
 address-family ipv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 next-hop-self
  neighbor 10.255.0.12 activate
  neighbor 10.255.0.12 next-hop-self
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
 description === to CORE ===
 ip address 10.0.0.6 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to EDGE1 ===
 ip address 10.0.0.10 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === eBGP to ISP-B (AS 65002) ===
 ip address 172.16.2.2 255.255.255.252
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
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 neighbor 172.16.2.1 remote-as 65002
 address-family ipv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 next-hop-self
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.11 next-hop-self
  neighbor 172.16.2.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## ISP-A

```
hostname ISP-A
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
 description === eBGP to EDGE1 (AS 65000) ===
 ip address 172.16.1.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to CONTENT (AS 65100) ===
 ip address 198.51.100.1 255.255.255.252
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
 neighbor 172.16.1.2 remote-as 65000
 neighbor 198.51.100.2 remote-as 65100
 address-family ipv4
  neighbor 172.16.1.2 activate
  neighbor 198.51.100.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## ISP-B

```
hostname ISP-B
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65002:99
!
enable secret lab123
username lab privilege 15 secret lab123
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
 description === eBGP to EDGE2 (AS 65000) ===
 ip address 172.16.2.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to CONTENT (AS 65100) ===
 ip address 203.0.113.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65002
 bgp router-id 10.255.2.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.2.2 remote-as 65000
 neighbor 203.0.113.2 remote-as 65100
 address-family ipv4
  neighbor 172.16.2.2 activate
  neighbor 203.0.113.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `02_local_pref`: LOCAL_PREF - the whole AS follows one edge's ISP-B preference

EDGE2 sets Local-Pref 200 on routes from ISP-B. CORE, which has no ISP link, and EDGE1, which has its own eBGP path, both switch to the path through EDGE2. The value stays inside the AS: ISP-A does not see it.

Push to: **EDGE2** (the same lines on each), in configuration mode.

**Apply**

```
route-map ISPB-IN permit 10
 set local-preference 200
router bgp 65000
 address-family ipv4
  neighbor 172.16.2.1 route-map ISPB-IN in
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no neighbor 172.16.2.1 route-map ISPB-IN in
no route-map ISPB-IN
```

**Check the result** (after about 40 s):

- `CORE# show ip bgp 100.100.100.0/24`
- `EDGE1# show ip bgp 100.100.100.0/24`
- `ISP-A# show ip bgp 100.100.100.0/24`

## Commands used to capture the README output

```
CORE# show ip bgp 100.100.100.0/24
EDGE1# show ip bgp 100.100.100.0/24
EDGE2# show ip bgp 100.100.100.0/24
ISP-A# show ip bgp 100.100.100.0/24
```
