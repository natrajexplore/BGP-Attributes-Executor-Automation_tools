# 09_community: all device configurations

COMMUNITY, tagging a route toward one ISP

Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the
captured output are in `README.md`.

## How to use it by hand

1. Import and start the lab (`labs/labtool.sh 09_community import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).
2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.
3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.
4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.

**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, `line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).

## Links

| Router A | Interface | Router B | Interface | Note |
|---|---|---|---|---|
| EDGE | e1/0 | ISP-A | e1/0 | 172.16.1.0/30 eBGP |
| EDGE | e1/1 | ISP-B | e1/0 | 172.16.2.0/30 eBGP |
| ISP-A | e1/1 | CONTENT | e1/0 | 198.51.100.0/30 eBGP |
| ISP-B | e1/1 | CONTENT | e1/1 | 203.0.113.0/30 eBGP |

## Devices

| Router | Role | AS | Management IP |
|---|---|---|---|
| EDGE | edge | 65000 | 192.168.99.11 |
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
interface FastEthernet0/0
 description === MGMT (Cloud1) ===
 ip vrf forwarding MGMT
 ip address 192.168.99.11 255.255.255.0
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/0
 description === eBGP to ISP-A (AS 65001) ===
 ip address 172.16.1.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
interface Ethernet1/1
 description === eBGP to ISP-B (AS 65002) ===
 ip address 172.16.2.2 255.255.255.252
 duplex auto
 speed auto
 no shutdown
!
ip route vrf MGMT 0.0.0.0 0.0.0.0 192.168.99.1
ip route 10.10.0.0 255.255.0.0 Null0
!
router bgp 65000
 bgp router-id 10.255.0.11
 bgp log-neighbor-changes
 no bgp default ipv4-unicast
 neighbor 172.16.1.1 remote-as 65001
 neighbor 172.16.2.1 remote-as 65002
 address-family ipv4
  network 10.10.0.0 mask 255.255.0.0
  neighbor 172.16.1.1 activate
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
 description === eBGP to EDGE (AS 65000) ===
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
ip bgp-community new-format
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
 description === eBGP to EDGE (AS 65000) ===
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

### Scenario `09_community`: COMMUNITY - no-export toward ISP-A keeps the route away from CONTENT via that ISP

EDGE attaches 65001:120 and no-export to 10.10.0.0/16 toward ISP-A. ISP-A shows the community and does not re-advertise the route to its eBGP peers, so CONTENT hears it only through ISP-B. The tag works on the path that carries it and nowhere else.

Push to: **EDGE** (the same lines on each), in configuration mode.

**Apply**

```
ip prefix-list TAGGED permit 10.10.0.0/16
route-map ISPA-COMM permit 10
 match ip address prefix-list TAGGED
 set community 65001:120 no-export additive
route-map ISPA-COMM permit 20
router bgp 65000
 address-family ipv4
  neighbor 172.16.1.1 send-community
  neighbor 172.16.1.1 route-map ISPA-COMM out
```

**Roll back**

```
router bgp 65000
 address-family ipv4
  no neighbor 172.16.1.1 route-map ISPA-COMM out
  no neighbor 172.16.1.1 send-community
no route-map ISPA-COMM
no ip prefix-list TAGGED
```

**Check the result** (after about 40 s):

- `ISP-A# show ip bgp 10.10.0.0/16`
- `ISP-A# show ip bgp 10.10.0.0/16`
- `CONTENT# show ip bgp 10.10.0.0/16`
- `CONTENT# show ip bgp 10.10.0.0/16`

## Commands used to capture the README output

```
ISP-A# show ip bgp 10.10.0.0/16
CONTENT# show ip bgp 10.10.0.0/16
ISP-A# show ip bgp community no-export
EDGE# show ip bgp neighbors 172.16.1.1 advertised-routes
```
