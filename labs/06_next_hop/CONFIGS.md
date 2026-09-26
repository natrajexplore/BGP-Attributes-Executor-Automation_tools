# 06_next_hop: all device configurations

NEXT_HOP, an ISP link that the IGP does not know

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 06_next_hop import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| ISP | e1/0 | EDGE | e1/0 | 172.16.1.0/30 eBGP (not in the IGP) |
| EDGE | e1/1 | CORE | e1/0 | 10.0.0.0/30 (OSPF) |
| CORE | e1/1 | CLIENT | e1/0 | 10.0.0.4/30 (OSPF) |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| ISP | provider | 65001 | 192.168.99.131 |
| EDGE | edge | 65000 | 192.168.99.111 |
| CORE | route-reflector | 65000 | 192.168.99.121 |
| CLIENT | internal | 65000 | 192.168.99.122 |

## CLIENT

```
hostname CLIENT
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
 ip address 10.255.0.20 255.255.255.255
 ip ospf 1 area 0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.122 255.255.255.0
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
router ospf 1
 router-id 10.255.0.20
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.20
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 activate
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
 ip address 192.168.99.121 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to EDGE ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to CLIENT ===
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
 neighbor 10.255.0.20 remote-as 65000
 neighbor 10.255.0.20 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.11 route-reflector-client
  neighbor 10.255.0.20 activate
  neighbor 10.255.0.20 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## EDGE

```
hostname EDGE
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
 ip address 192.168.99.111 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to ISP (AS 65001) ===
 ip address 172.16.1.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to CORE ===
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
 neighbor 172.16.1.1 remote-as 65001
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family ipv4
  neighbor 172.16.1.1 activate
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 next-hop-self
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
interface Loopback1
 description === content network ===
 ip address 100.100.100.1 255.255.255.0
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
 description === eBGP to EDGE (AS 65000) ===
 ip address 172.16.1.1 255.255.255.252
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
 address-family ipv4
  network 100.100.100.0 mask 255.255.255.0
  neighbor 172.16.1.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `06_next_hop`: NEXT_HOP - without next-hop-self the route becomes inaccessible and is never reflected

EDGE stops rewriting NEXT_HOP toward CORE. CORE keeps the path as 172.16.1.1 (inaccessible), because the IGP has no route to the ISP link, and a route reflector only reflects a path it can use, so CLIENT never learns the prefix.

Push to: **EDGE** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 address-family ipv4
  no neighbor 10.255.0.1 next-hop-self
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  neighbor 10.255.0.1 next-hop-self
```

**Check the result** (after about 20 s):

- `CORE# show ip bgp 100.100.100.0/24`
- `CORE# show ip route 172.16.1.1`
- `CLIENT# show ip bgp 100.100.100.0/24`

## Commands used to capture the README output

```
CORE# show ip bgp 100.100.100.0/24
CORE# show ip route 172.16.1.1
CLIENT# show ip bgp 100.100.100.0/24
EDGE# show running-config | include next-hop-self
```
