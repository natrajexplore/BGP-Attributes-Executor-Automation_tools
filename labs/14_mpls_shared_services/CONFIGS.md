# 14_mpls_shared_services: all device configurations

MPLS L3VPN shared services, two customers reach one service VRF but not each other

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 14_mpls_shared_services import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| CE-A | e1/0 | PE1 | e1/1 | 172.16.1.0/30 eBGP PE-CE, customer A |
| CE-B | e1/0 | PE1 | e1/2 | 172.16.2.0/30 eBGP PE-CE, customer B |
| PE1 | e1/0 | P | e1/0 | 10.0.1.0/30 core (OSPF, LDP) |
| P | e1/1 | PE2 | e1/0 | 10.0.2.0/30 core (OSPF, LDP) |
| PE2 | e1/1 | CE-SVC | e1/0 | 172.16.3.0/30 eBGP PE-CE, shared services |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| CE-A | customer | 65101 | 192.168.99.11 |
| CE-B | customer | 65201 | 192.168.99.13 |
| PE1 | pe | 65000 | 192.168.99.21 |
| P | core | 65000 | 192.168.99.22 |
| PE2 | pe | 65000 | 192.168.99.23 |
| CE-SVC | customer | 65900 | 192.168.99.14 |

## CE-A

```
hostname CE-A
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

## CE-B

```
hostname CE-B
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65201:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === customer LAN ===
 ip address 10.2.0.1 255.255.255.0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.13 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to the provider PE (AS 65000) ===
 ip address 172.16.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65201
 bgp router-id 10.255.201.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.2.1 remote-as 65000
 address-family ipv4
  network 10.2.0.0 mask 255.255.255.0
  neighbor 172.16.2.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## CE-SVC

```
hostname CE-SVC
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65900:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === customer LAN ===
 ip address 10.9.0.1 255.255.255.0
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
 ip address 172.16.3.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65900
 bgp router-id 10.255.190.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.3.1 remote-as 65000
 address-family ipv4
  network 10.9.0.0 mask 255.255.255.0
  neighbor 172.16.3.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## P

```
hostname P
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
ip vrf CUST-A
 rd 65000:100
 route-target export 65000:100
 route-target import 65000:100
 route-target import 65000:900
ip vrf CUST-B
 rd 65000:200
 route-target export 65000:200
 route-target import 65000:200
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
 description === PE-CE to CE-A, VRF CUST-A ===
 ip vrf forwarding CUST-A
 ip address 172.16.1.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === PE-CE to CE-B, VRF CUST-B ===
 ip vrf forwarding CUST-B
 ip address 172.16.2.1 255.255.255.252
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
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended
 exit-address-family
 address-family ipv4 vrf CUST-A
  neighbor 172.16.1.2 remote-as 65101
  neighbor 172.16.1.2 activate
 exit-address-family
 address-family ipv4 vrf CUST-B
  neighbor 172.16.2.2 remote-as 65201
  neighbor 172.16.2.2 activate
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
ip vrf SHARED
 rd 65000:900
 route-target export 65000:900
 route-target import 65000:100
 route-target import 65000:200
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
 ip address 10.0.2.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 mpls ip
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === PE-CE to CE-SVC, VRF SHARED ===
 ip vrf forwarding SHARED
 ip address 172.16.3.1 255.255.255.252
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
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 send-community extended
 exit-address-family
 address-family ipv4 vrf SHARED
  neighbor 172.16.3.2 remote-as 65900
  neighbor 172.16.3.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `14_mpls_shared_services`: Extranet - onboarding customer B to the shared services VRF with one import route-target

SHARED (at PE2) exports RT 65000:900 and imports both customer RTs, so the services network already has a route to customer B, but B's VRF does not import 900, so B has no route to the services. The scenario adds "route-target import 65000:900" to B's VRF at PE1. B reaches the services; A and B still cannot see each other.

Push to: **PE1** (the same lines on each), in configuration mode.

**Apply**

```
ip vrf CUST-B
 route-target import 65000:900
```

**Roll back**

```
ip vrf CUST-B
 no route-target import 65000:900
```

**Check the result** (after about 40 s):

- `PE1# show ip route vrf CUST-B 10.9.0.0`
- `CE-B# show ip route 10.9.0.0`
- `CE-A# show ip route 10.2.0.0`

## Commands used to capture the README output

```
PE2# show ip route vrf SHARED
PE1# show ip route vrf CUST-A
PE1# show ip route vrf CUST-B
CE-B# show ip route 10.9.0.0
CE-A# show ip route 10.2.0.0
CE-SVC# show ip route 10.2.0.0
```
