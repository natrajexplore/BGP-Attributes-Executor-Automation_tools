# 05_med: all device configurations

an enterprise with two data centres, each linked to a different POP of the SAME provider.

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 05_med import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| DC-EAST | e1/0 | DC-WEST | e1/0 | 10.0.0.0/30   enterprise inter-DC link (OSPF) |
| DC-EAST | e1/1 | ISP-E | e1/0 | 172.16.1.0/30 eBGP, DC-East to provider POP-East |
| DC-WEST | e1/1 | ISP-W | e1/0 | 172.16.2.0/30 eBGP, DC-West to provider POP-West |
| ISP-E | e1/1 | ISP-W | e1/1 | 192.0.2.0/30  provider backbone (OSPF + iBGP) |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| DC-EAST | edge | 65000 | 192.168.99.11 |
| DC-WEST | edge | 65000 | 192.168.99.12 |
| ISP-E | provider | 65001 | 192.168.99.31 |
| ISP-W | provider | 65001 | 192.168.99.32 |

## DC-EAST

```
hostname DC-EAST
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
 ip address 192.168.99.11 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to DC-WEST ===
 ip address 10.0.0.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to ISP-E (AS 65001) ===
 ip address 172.16.1.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.1
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
ip route 10.1.0.0 255.255.0.0 Null0
ip prefix-list LOCAL-DC seq 5 permit 10.1.0.0/16
!
router bgp 65000
 bgp router-id 10.255.0.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.2 remote-as 65000
 neighbor 10.255.0.2 update-source Loopback0
 neighbor ISP peer-group
 neighbor ISP remote-as 65001
 neighbor 172.16.1.1 peer-group ISP
 address-family ipv4
  network 10.1.0.0 mask 255.255.0.0
  neighbor 10.255.0.2 activate
  neighbor 10.255.0.2 next-hop-self
  neighbor 172.16.1.1 peer-group ISP
  neighbor ISP activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## DC-WEST

```
hostname DC-WEST
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
 ip address 192.168.99.12 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to DC-EAST ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to ISP-W (AS 65001) ===
 ip address 172.16.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.0.2
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
ip route 10.2.0.0 255.255.0.0 Null0
ip prefix-list LOCAL-DC seq 5 permit 10.2.0.0/16
!
router bgp 65000
 bgp router-id 10.255.0.2
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 neighbor ISP peer-group
 neighbor ISP remote-as 65001
 neighbor 172.16.2.1 peer-group ISP
 address-family ipv4
  network 10.2.0.0 mask 255.255.0.0
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 next-hop-self
  neighbor 172.16.2.1 peer-group ISP
  neighbor ISP activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## ISP-E

```
hostname ISP-E
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65001:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback0
 ip address 10.255.1.1 255.255.255.255
 ip ospf 1 area 0
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
 description === eBGP to DC-EAST (AS 65000) ===
 ip address 172.16.1.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === backbone to ISP-W ===
 ip address 192.0.2.1 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.1.1
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65001
 bgp router-id 10.255.1.1
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.1.2 remote-as 65001
 neighbor 10.255.1.2 update-source Loopback0
 neighbor 172.16.1.2 remote-as 65000
 address-family ipv4
  neighbor 10.255.1.2 activate
  neighbor 10.255.1.2 next-hop-self
  neighbor 172.16.1.2 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## ISP-W

```
hostname ISP-W
no ip domain lookup
ip domain name lab.local
!
ip vrf MGMT
 rd 65001:99
!
enable secret lab123
username lab privilege 15 secret lab123
!
interface Loopback0
 ip address 10.255.1.2 255.255.255.255
 ip ospf 1 area 0
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
 description === eBGP to DC-WEST (AS 65000) ===
 ip address 172.16.2.1 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === backbone to ISP-E ===
 ip address 192.0.2.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
router ospf 1
 router-id 10.255.1.2
 passive-interface Loopback0
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
!
router bgp 65001
 bgp router-id 10.255.1.2
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 10.255.1.1 remote-as 65001
 neighbor 10.255.1.1 update-source Loopback0
 neighbor 172.16.2.2 remote-as 65000
 address-family ipv4
  neighbor 10.255.1.1 activate
  neighbor 10.255.1.1 next-hop-self
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

### Scenario `05_med`: MED - the provider delivers each data centre's traffic to the right site

DC-EAST and DC-WEST each advertise both prefixes to the provider, with MED 50 for their own prefix and MED 200 for the other site's. The provider's routers hear every prefix from the same neighbor AS over two links, so MED is compared and each prefix is delivered over the link of the site where it lives.

Push to: **DC-EAST, DC-WEST** (the same lines on each), in configuration mode.

**Apply**

```
route-map MED-OUT permit 10
 match ip address prefix-list LOCAL-DC
 set metric 50
route-map MED-OUT permit 20
 set metric 200
router bgp 65000
 address-family ipv4
  neighbor ISP route-map MED-OUT out
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no neighbor ISP route-map MED-OUT out
no route-map MED-OUT
```

**Check the result** (after about 40 s):

- `ISP-E# show ip bgp 10.2.0.0/16`
- `ISP-W# show ip bgp 10.1.0.0/16`
- `ISP-E# show ip bgp 10.1.0.0/16`
- `ISP-W# show ip bgp 10.2.0.0/16`
