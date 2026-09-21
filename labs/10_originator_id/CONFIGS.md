# 10_originator_id: all device configurations

ORIGINATOR_ID, following a route through a route reflector

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 10_originator_id import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| RR | e1/0 | C1 | e1/0 | 10.0.0.0/30 (OSPF) |
| RR | e1/1 | C2 | e1/0 | 10.0.0.4/30 (OSPF) |
| RR | e1/2 | C3 | e1/0 | 10.0.0.8/30 (OSPF) |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| RR | route-reflector | 65000 | 192.168.99.21 |
| C1 | route-reflector-client | 65000 | 192.168.99.11 |
| C2 | route-reflector-client | 65000 | 192.168.99.12 |
| C3 | route-reflector-client | 65000 | 192.168.99.13 |

## C1

```
hostname C1
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
 description === to RR ===
 ip address 10.0.0.2 255.255.255.252
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

## C2

```
hostname C2
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
 description === to RR ===
 ip address 10.0.0.6 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
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

## C3

```
hostname C3
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
 ip address 10.255.0.13 255.255.255.255
 ip ospf 1 area 0
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
 description === to RR ===
 ip address 10.0.0.10 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.13
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65000
 bgp router-id 10.255.0.13
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
 description === to C1 ===
 ip address 10.0.0.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to C2 ===
 ip address 10.0.0.5 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/2
 description === to C3 ===
 ip address 10.0.0.9 255.255.255.252
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
 neighbor 10.255.0.13 remote-as 65000
 neighbor 10.255.0.13 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.11 activate
  neighbor 10.255.0.11 route-reflector-client
  neighbor 10.255.0.12 activate
  neighbor 10.255.0.12 route-reflector-client
  neighbor 10.255.0.13 activate
  neighbor 10.255.0.13 route-reflector-client
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `10_duplicate_id`: ORIGINATOR_ID - a duplicate router-ID makes C3 discard C1's route

Run after 10_originator_id. C3 takes C1's router-ID (10.255.0.11). The reflector still has C1's prefix, but C3 sees its own ID as the originator of the reflected route and discards it. Rolling back restores C3's own router-ID.

Push to: **C3** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 bgp router-id 10.255.0.11
```

**Roll back**

```
router bgp 65000
 bgp router-id 10.255.0.13
```

**Check the result** (after about 75 s):

- `C3# show ip bgp summary`
- `C3# show ip bgp 10.255.99.1/32`
- `RR# show ip bgp 10.255.99.1/32`

### Scenario `10_originator_id`: ORIGINATOR_ID - the reflector names C1 as the source of the route

C1 advertises 10.255.99.1/32. The route reflector adds ORIGINATOR_ID 10.255.0.11 when it reflects the route to C2 and C3. C1 itself shows the route as sourced and local, with no originator.

Push to: **C1** (the same lines on each), in configuration mode.

**Apply**

```
interface Loopback9
 description ORIGINATOR_ID probe
 ip address 10.255.99.1 255.255.255.255
router bgp 65000
 address-family ipv4
  network 10.255.99.1 mask 255.255.255.255
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no network 10.255.99.1 mask 255.255.255.255
no interface Loopback9
```

**Check the result** (after about 15 s):

- `C2# show ip bgp 10.255.99.1/32`
- `C3# show ip bgp 10.255.99.1/32`
- `C1# show ip bgp 10.255.99.1/32`

## Commands used to capture the README output

```
C1# show ip bgp 10.255.99.1/32
RR# show ip bgp 10.255.99.1/32
C2# show ip bgp 10.255.99.1/32
C3# show ip bgp 10.255.99.1/32
```
