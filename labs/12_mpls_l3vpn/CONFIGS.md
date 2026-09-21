# 12_mpls_l3vpn: all device configurations

MPLS L3VPN basics, one customer, two sites over an MPLS core

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 12_mpls_l3vpn import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| CE1 | e1/0 | PE1 | e1/1 | 172.16.1.0/30 eBGP PE-CE, customer site 1 |
| PE1 | e1/0 | P | e1/0 | 10.0.1.0/30 core (OSPF, LDP) |
| P | e1/1 | PE2 | e1/0 | 10.0.2.0/30 core (OSPF, LDP) |
| PE2 | e1/1 | CE2 | e1/0 | 172.16.2.0/30 eBGP PE-CE, customer site 2 |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| CE1 | customer | 65101 | 192.168.99.11 |
| PE1 | pe | 65000 | 192.168.99.21 |
| P | core | 65000 | 192.168.99.22 |
| PE2 | pe | 65000 | 192.168.99.23 |
| CE2 | customer | 65102 | 192.168.99.12 |

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
 ip address 10.1.1.1 255.255.255.0
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
  network 10.1.1.0 mask 255.255.255.0
  neighbor 172.16.1.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## CE2

```
hostname CE2
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65102:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback1
 description === customer LAN ===
 ip address 10.2.1.1 255.255.255.0
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
 description === eBGP to the provider PE (AS 65000) ===
 ip address 172.16.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65102
 bgp router-id 10.255.102.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.2.1 remote-as 65000
 address-family ipv4
  network 10.2.1.0 mask 255.255.255.0
  neighbor 172.16.2.1 activate
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
ip vrf CUST
 rd 65000:1
 route-target both 65000:1
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
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended
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
 rd 65000:1
 route-target both 65000:1
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
 description === PE-CE to CE2, VRF CUST ===
 ip vrf forwarding CUST
 ip address 172.16.2.1 255.255.255.252
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
 address-family ipv4 vrf CUST
  neighbor 172.16.2.2 remote-as 65102
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

### Scenario `12_mpls_l3vpn`: L3VPN - a mistyped import route-target silently breaks one direction of the VPN

PE2 imports route-target 65000:1 into VRF CUST, which is how it learns site 1's prefix from PE1. The scenario changes PE2's import RT to 65000:11 (a typo). The VPNv4 route still arrives at PE2, but no VRF imports it, so the route vanishes from VRF CUST and site 2 loses site 1. Rollback restores the import RT.

Push to: **PE2** (the same lines on each), in configuration mode.

**Apply**

```
ip vrf CUST
 no route-target import 65000:1
 route-target import 65000:11
```

**Roll back**

```
ip vrf CUST
 no route-target import 65000:11
 route-target import 65000:1
```

**Check the result** (after about 20 s):

- `PE2# show bgp vpnv4 unicast all 10.1.1.0/24`
- `PE2# show ip route vrf CUST 10.1.1.0`

## Commands used to capture the README output

```
PE1# show mpls ldp neighbor
PE1# show bgp vpnv4 unicast all summary
PE1# show bgp vpnv4 unicast all 10.2.1.0/24
PE2# show ip route vrf CUST 10.1.1.0
PE1# show ip cef vrf CUST 10.2.1.0 detail
CE1# show ip route 10.2.1.0
CE1# ping 10.2.1.1 source Loopback1
```
