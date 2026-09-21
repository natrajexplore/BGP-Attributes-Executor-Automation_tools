# 16_mpls_vpnv4_rr: all device configurations

MPLS L3VPN at scale, a VPNv4 route reflector and the route-target filter

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 16_mpls_vpnv4_rr import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| PE1 | e1/0 | RR | e1/0 | 10.0.1.0/30 core |
| PE2 | e1/0 | RR | e1/1 | 10.0.2.0/30 core |
| PE3 | e1/0 | RR | e1/2 | 10.0.3.0/30 core |
| PE4 | e1/0 | RR | e1/3 | 10.0.4.0/30 core |
| CE1 | e1/0 | PE1 | e1/1 | 172.16.1.0/30 eBGP PE-CE |
| CE4 | e1/0 | PE4 | e1/1 | 172.16.4.0/30 eBGP PE-CE |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| CE1 | customer | 65101 | 192.168.99.11 |
| CE4 | customer | 65104 | 192.168.99.14 |
| PE1 | pe | 65000 | 192.168.99.21 |
| PE2 | pe | 65000 | 192.168.99.22 |
| PE3 | pe | 65000 | 192.168.99.23 |
| PE4 | pe | 65000 | 192.168.99.24 |
| RR | core | 65000 | 192.168.99.30 |

## CE1

```
hostname CE1
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65101:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === customer LAN ===
 ip address 10.1.0.1 255.255.255.0
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
 description === eBGP to the provider PE (AS 65000) ===
 ip address 172.16.1.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65101
 bgp router-id 10.255.101.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.1.1 remote-as 65000
 address-family ipv4
  network 10.1.0.0 mask 255.255.255.0
  neighbor 172.16.1.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## CE4

```
hostname CE4
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65104:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === customer LAN ===
 ip address 10.4.0.1 255.255.255.0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.14 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to the provider PE (AS 65000) ===
 ip address 172.16.4.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65104
 bgp router-id 10.255.104.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.4.1 remote-as 65000
 address-family ipv4
  network 10.4.0.0 mask 255.255.255.0
  neighbor 172.16.4.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## PE1

```
hostname PE1
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
ip vrf CUST
 rd 65000:1
 route-target export 65000:1
 route-target import 65000:1
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
 description === core link (MPLS + OSPF) ===
 ip address 10.0.1.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === PE-CE to CE1, VRF CUST ===
 ip vrf forwarding CUST
 ip address 172.16.1.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.1
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
mpls ldp router-id Loopback0 force
!
router bgp 65000
 bgp router-id 10.255.0.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.10 remote-as 65000
 neighbor 10.255.0.10 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.10 activate
  neighbor 10.255.0.10 send-community extended
 exit-address-family
 address-family ipv4 vrf CUST
  neighbor 172.16.1.2 remote-as 65101
  neighbor 172.16.1.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## PE2

```
hostname PE2
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
ip vrf CUST
 rd 65000:2
 route-target export 65000:1
 route-target import 65000:1
!
interface Loopback0
 ip address 10.255.0.2 255.255.255.255
 ip ospf 1 area 0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.22 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === core link (MPLS + OSPF) ===
 ip address 10.0.2.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.2
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
mpls ldp router-id Loopback0 force
!
router bgp 65000
 bgp router-id 10.255.0.2
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.10 remote-as 65000
 neighbor 10.255.0.10 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.10 activate
  neighbor 10.255.0.10 send-community extended
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## PE3

```
hostname PE3
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
ip vrf CUST
 rd 65000:3
 route-target export 65000:1
 route-target import 65000:1
!
interface Loopback0
 ip address 10.255.0.3 255.255.255.255
 ip ospf 1 area 0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.23 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === core link (MPLS + OSPF) ===
 ip address 10.0.3.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.3
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
mpls ldp router-id Loopback0 force
!
router bgp 65000
 bgp router-id 10.255.0.3
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.10 remote-as 65000
 neighbor 10.255.0.10 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.10 activate
  neighbor 10.255.0.10 send-community extended
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## PE4

```
hostname PE4
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65000:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
ip vrf CUST
 rd 65000:4
 route-target export 65000:1
 route-target import 65000:1
!
interface Loopback0
 ip address 10.255.0.4 255.255.255.255
 ip ospf 1 area 0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.24 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === core link (MPLS + OSPF) ===
 ip address 10.0.4.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === PE-CE to CE4, VRF CUST ===
 ip vrf forwarding CUST
 ip address 172.16.4.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.4
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
mpls ldp router-id Loopback0 force
!
router bgp 65000
 bgp router-id 10.255.0.4
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.10 remote-as 65000
 neighbor 10.255.0.10 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.10 activate
  neighbor 10.255.0.10 send-community extended
 exit-address-family
 address-family ipv4 vrf CUST
  neighbor 172.16.4.2 remote-as 65104
  neighbor 172.16.4.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## RR

```
hostname RR
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
 ip address 10.255.0.10 255.255.255.255
 ip ospf 1 area 0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.30 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === core to PE1 ===
 ip address 10.0.1.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === core to PE2 ===
 ip address 10.0.2.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === core to PE3 ===
 ip address 10.0.3.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/3
 description === core to PE4 ===
 ip address 10.0.4.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.10
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
mpls ldp router-id Loopback0 force
!
router bgp 65000
 bgp router-id 10.255.0.10
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 no bgp default route-target filter
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor 10.255.0.2 remote-as 65000
 neighbor 10.255.0.2 update-source Loopback0
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 neighbor 10.255.0.4 remote-as 65000
 neighbor 10.255.0.4 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 send-community extended
  neighbor 10.255.0.1 route-reflector-client
  neighbor 10.255.0.2 activate
  neighbor 10.255.0.2 send-community extended
  neighbor 10.255.0.2 route-reflector-client
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended
  neighbor 10.255.0.3 route-reflector-client
  neighbor 10.255.0.4 activate
  neighbor 10.255.0.4 send-community extended
  neighbor 10.255.0.4 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `16_mpls_vpnv4_rr`: VPNv4 route reflector - two PEs lose client status and stop hearing each other

The RR reflects routes between four PE clients. The scenario removes "route-reflector-client" for PE1 and PE4 only. A route-reflector reflects a client's route to every peer, but a non-client's route only to clients, so the two non-clients no longer receive each other's routes. PE1 and PE4 lose each other while PE2 and PE3 still hear both, and the RR itself still holds both routes.

Push to: **RR** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 address-family vpnv4
  no neighbor 10.255.0.1 route-reflector-client
  no neighbor 10.255.0.4 route-reflector-client
do clear ip bgp vpnv4 unicast * soft
```

**Roll back**

```
router bgp 65000
 address-family vpnv4
  neighbor 10.255.0.1 route-reflector-client
  neighbor 10.255.0.4 route-reflector-client
do clear ip bgp vpnv4 unicast * soft
```

**Check the result** (after about 60 s):

- `PE1# show ip route vrf CUST 10.4.0.0`
- `PE2# show ip route vrf CUST 10.4.0.0`
- `RR# show bgp vpnv4 unicast all 10.4.0.0/24`

## Commands used to capture the README output

```
RR# show bgp vpnv4 unicast all summary
PE1# show ip route vrf CUST 10.4.0.0
PE2# show ip route vrf CUST
RR# show bgp vpnv4 unicast all 10.4.0.0/24
CE1# show ip route 10.4.0.0
```
