# 11_cluster_list: all device configurations

CLUSTER_LIST, a two-tier reflector hierarchy and a cluster-ID clash

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 11_cluster_list import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| RR-TOP | e1/0 | RR-EU | e1/0 | 10.0.0.0/30 (OSPF) |
| RR-TOP | e1/1 | RR-US | e1/0 | 10.0.0.4/30 (OSPF) |
| RR-EU | e1/1 | EU-1 | e1/0 | 10.0.0.8/30 (OSPF) |
| RR-US | e1/1 | US-1 | e1/0 | 10.0.0.12/30 (OSPF) |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| RR-TOP | route-reflector | 65000 | 192.168.99.21 |
| RR-EU | route-reflector | 65000 | 192.168.99.22 |
| RR-US | route-reflector | 65000 | 192.168.99.23 |
| EU-1 | leaf | 65000 | 192.168.99.11 |
| US-1 | leaf | 65000 | 192.168.99.12 |

## EU-1

```
hostname EU-1
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
interface Loopback1
 description === EU network ===
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
 description === to RR-EU ===
 ip address 10.0.0.10 255.255.255.252
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
 neighbor 10.255.0.2 remote-as 65000
 neighbor 10.255.0.2 update-source Loopback0
 address-family ipv4
  network 10.1.1.0 mask 255.255.255.0
  neighbor 10.255.0.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## RR-EU

```
hostname RR-EU
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
 description === to RR-TOP ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to EU-1 ===
 ip address 10.0.0.9 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.2
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.2
 bgp log-neighbor-changes
 bgp cluster-id 2.2.2.2
 no bgp default ipv4-unicast
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.11 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## RR-TOP

```
hostname RR-TOP
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
 description === to RR-EU ===
 ip address 10.0.0.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to RR-US ===
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
 bgp cluster-id 1.1.1.1
 no bgp default ipv4-unicast
 neighbor 10.255.0.2 remote-as 65000
 neighbor 10.255.0.2 update-source Loopback0
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.2 activate
  neighbor 10.255.0.2 route-reflector-client
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## RR-US

```
hostname RR-US
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
 description === to RR-TOP ===
 ip address 10.0.0.6 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to US-1 ===
 ip address 10.0.0.13 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.3
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.3
 bgp log-neighbor-changes
 bgp cluster-id 3.3.3.3
 no bgp default ipv4-unicast
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor 10.255.0.21 remote-as 65000
 neighbor 10.255.0.21 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.21 activate
  neighbor 10.255.0.21 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## US-1

```
hostname US-1
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
 ip address 10.255.0.21 255.255.255.255
 ip ospf 1 area 0
!
interface Loopback1
 description === US network ===
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
 description === to RR-US ===
 ip address 10.0.0.14 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.21
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.21
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family ipv4
  network 10.2.1.0 mask 255.255.255.0
  neighbor 10.255.0.3 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `11_cluster_list`: CLUSTER_LIST - a cluster-ID clash between tiers makes the reflectors discard each other's routes

RR-US takes RR-TOP's cluster-ID. RR-US discards the EU route reflected by RR-TOP (its own ID is in the cluster list), and RR-TOP discards the US route reflected by RR-US, so US-1 loses 10.1.1.0/24 and EU-1 loses 10.2.1.0/24. All sessions stay up.

Push to: **RR-US** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 bgp cluster-id 1.1.1.1
```

**Roll back**

```
router bgp 65000
 bgp cluster-id 3.3.3.3
```

**Check the result** (after about 40 s):

- `RR-US# show ip bgp 10.1.1.0/24`
- `US-1# show ip bgp 10.1.1.0/24`
- `RR-TOP# show ip bgp 10.2.1.0/24`

## Commands used to capture the README output

```
US-1# show ip bgp 10.1.1.0/24
RR-US# show ip bgp 10.1.1.0/24
RR-TOP# show ip bgp 10.2.1.0/24
EU-1# show ip bgp 10.2.1.0/24
RR-US# show running-config | section router bgp
```
