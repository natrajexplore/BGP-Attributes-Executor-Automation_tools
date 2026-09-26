# 07_atomic_aggregate: all device configurations

ATOMIC_AGGREGATE, a summary on one edge and not the other

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 07_atomic_aggregate import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| CE-LAN | e1/0 | EDGE1 | e1/0 | 10.0.0.0/30 (OSPF) |
| CE-LAN | e1/1 | EDGE2 | e1/0 | 10.0.0.4/30 (OSPF) |
| EDGE1 | e1/1 | EDGE2 | e1/1 | 10.0.0.8/30 (OSPF) |
| EDGE1 | e1/2 | ISP-A | e1/0 | 172.16.1.0/30 eBGP |
| EDGE2 | e1/2 | ISP-B | e1/0 | 172.16.2.0/30 eBGP |
| ISP-A | e1/1 | ISP-B | e1/1 | 192.0.2.0/30 eBGP between the ISPs |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| CE-LAN | internal | 65000 | 192.168.99.120 |
| EDGE1 | edge | 65000 | 192.168.99.111 |
| EDGE2 | edge | 65000 | 192.168.99.112 |
| ISP-A | provider | 65001 | 192.168.99.131 |
| ISP-B | provider | 65002 | 192.168.99.132 |

## CE-LAN

```
hostname CE-LAN
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
interface Loopback1
 description === component 10.10.0.0/24 ===
 ip address 10.10.0.1 255.255.255.0
!
interface Loopback2
 description === component 10.10.1.0/24 ===
 ip address 10.10.1.1 255.255.255.0
!
interface Loopback3
 description === component 10.10.2.0/24 ===
 ip address 10.10.2.1 255.255.255.0
!
interface Loopback4
 description === component 10.10.3.0/24 ===
 ip address 10.10.3.1 255.255.255.0
!
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.120 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to EDGE1 ===
 ip address 10.0.0.2 255.255.255.252
 ip ospf 1 area 0
 ip ospf network point-to-point
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === to EDGE2 ===
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
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 neighbor 10.255.0.12 remote-as 65000
 neighbor 10.255.0.12 update-source Loopback0
 address-family ipv4
  network 10.10.0.0 mask 255.255.255.0
  network 10.10.1.0 mask 255.255.255.0
  network 10.10.2.0 mask 255.255.255.0
  network 10.10.3.0 mask 255.255.255.0
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
 ip address 192.168.99.111 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to CE-LAN ===
 ip address 10.0.0.1 255.255.255.252
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
 neighbor 10.255.0.20 remote-as 65000
 neighbor 10.255.0.20 update-source Loopback0
 neighbor 10.255.0.12 remote-as 65000
 neighbor 10.255.0.12 update-source Loopback0
 neighbor 172.16.1.1 remote-as 65001
 address-family ipv4
  neighbor 10.255.0.20 activate
  neighbor 10.255.0.20 next-hop-self
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
 ip address 192.168.99.112 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === to CE-LAN ===
 ip address 10.0.0.5 255.255.255.252
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
 neighbor 10.255.0.20 remote-as 65000
 neighbor 10.255.0.20 update-source Loopback0
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 update-source Loopback0
 neighbor 172.16.2.1 remote-as 65002
 address-family ipv4
  neighbor 10.255.0.20 activate
  neighbor 10.255.0.20 next-hop-self
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
 ip address 192.168.99.131 255.255.255.0
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
 description === eBGP to ISP-B (AS 65002) ===
 ip address 192.0.2.1 255.255.255.252
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
 neighbor 192.0.2.2 remote-as 65002
 address-family ipv4
  neighbor 172.16.1.2 activate
  neighbor 192.0.2.2 activate
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
 ip address 192.168.99.132 255.255.255.0
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
 description === eBGP to ISP-A (AS 65001) ===
 ip address 192.0.2.2 255.255.255.252
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
 neighbor 192.0.2.1 remote-as 65001
 address-family ipv4
  neighbor 172.16.2.2 activate
  neighbor 192.0.2.1 activate
 exit-address-family
!
line vty 0 4
 login local
 transport input ssh
!
end
```

## Scenarios (the change the lab is about)

### Scenario `07_atomic_aggregate`: ATOMIC_AGGREGATE - EDGE1 summarises 10.10.0.0/16, EDGE2 does not

EDGE1 summarises the four /24 networks with summary-only and no as-set. ISP-A receives the /16 flagged atomic-aggregate and aggregated by 65000 10.255.0.11, and no /24 from EDGE1. It still has the /24 networks through ISP-B, because EDGE2 does not summarise.

Push to: **EDGE1** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 summary-only
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no aggregate-address 10.10.0.0 255.255.0.0 summary-only
```

**Check the result** (after about 40 s):

- `ISP-A# show ip bgp 10.10.0.0/16`
- `ISP-A# show ip bgp 10.10.0.0/16`
- `ISP-A# show ip bgp 10.10.1.0/24`

### Scenario `07_fix`: ATOMIC_AGGREGATE - make the summary consistent by summarising on EDGE2 too

Run after 07_atomic_aggregate. EDGE2 builds the same summary, so ISP-B stops hearing the /24 networks and ISP-A no longer learns them through ISP-B. Rolling back returns to the state where only EDGE1 summarises.

Push to: **EDGE2** (the same lines on each), in configuration mode.

**Apply**

```
router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 summary-only
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no aggregate-address 10.10.0.0 255.255.0.0 summary-only
```

**Check the result** (after about 40 s):

- `ISP-A# show ip bgp 10.10.1.0/24`
- `ISP-B# show ip bgp 10.10.1.0/24`

## Commands used to capture the README output

```
ISP-A# show ip bgp 10.10.0.0/16
ISP-A# show ip bgp 10.10.1.0/24
ISP-B# show ip bgp 10.10.1.0/24
EDGE1# show ip bgp 10.10.0.0/16 longer-prefixes
```
