# Addressing plan

## Loopback0 / router-id (AS 65000)

| Node | Loopback0 / RID | Cluster-id |
|------|-----------------|------------|
| CORE-RR1 | 10.255.0.1 | 10.255.0.1 |
| CORE-RR2 | 10.255.0.2 | 10.255.0.2 |
| EDGE1 | 10.255.0.11 | – |
| EDGE2 | 10.255.0.12 | – |
| CE-LAN | 10.255.0.20 | – |

ISP / content router-ids: ISPA-1 `10.255.1.1`, ISPB-1 `10.255.2.1`, CONTENT `10.255.100.1`.

## Core P2P links (10.0.0.0/24, /30s)

| Link | Subnet | Low / High |
|------|--------|------------|
| CORE-RR1 – CORE-RR2 | 10.0.0.0/30 | .1 RR1 / .2 RR2 |
| CORE-RR1 – EDGE1 | 10.0.0.4/30 | .5 RR1 / .6 EDGE1 |
| CORE-RR1 – EDGE2 | 10.0.0.8/30 | .9 RR1 / .10 EDGE2 |
| CORE-RR2 – EDGE1 | 10.0.0.12/30 | .13 RR2 / .14 EDGE1 |
| CORE-RR2 – EDGE2 | 10.0.0.16/30 | .17 RR2 / .18 EDGE2 |
| CORE-RR1 – CE-LAN | 10.0.0.20/30 | .21 RR1 / .22 CE-LAN |
| CORE-RR2 – CE-LAN | 10.0.0.24/30 | .25 RR2 / .26 CE-LAN |

## eBGP / provider links (documentation ranges)

| Link | Subnet | Low / High | eBGP |
|------|--------|------------|------|
| EDGE1 – ISPA-1 | 172.16.12.0/30 | .1 ISPA-1 / .2 EDGE1 | 65000 ↔ 65001 |
| EDGE2 – ISPB-1 | 172.16.34.0/30 | .1 ISPB-1 / .2 EDGE2 | 65000 ↔ 65002 |
| ISPA-1 – ISPB-1 | 192.0.2.0/30 | .1 ISPA-1 / .2 ISPB-1 | 65001 ↔ 65002 |
| ISPA-1 – CONTENT | 198.51.100.0/30 | .1 ISPA-1 / .2 CONTENT | 65001 ↔ 65100 |
| ISPB-1 – CONTENT | 203.0.113.0/30 | .1 ISPB-1 / .2 CONTENT | 65002 ↔ 65100 |

## Advertised prefixes

| Prefix | Origin | Notes |
|--------|--------|-------|
| 100.100.100.0/24 | CONTENT Loopback0 | the prefix most scenarios steer |
| 10.10.0.0/24 – 10.10.3.0/24 | CE-LAN Loopback1-4 | components; aggregated in 07/08 |
| 10.255.99.1/32 | EDGE1 (scenario 10 only) | added to show ORIGINATOR_ID |

## Out-of-band management — VRF `MGMT` on `Fa0/0`, 192.168.99.0/24 (EVE `Cloud1` / `pnet1`)

> **This project uses 192.168.99.101 to 192.168.99.199 only** (the last octet is 100 plus a per-router number: .111 to .114 for CE/edge routers, .120 to .124 for core and PE routers, .130 to .133 for ISPs and content).
> Other projects share the same `pnet1` bridge and subnet: for example the `ospf-sla` lab uses 192.168.99.11 to .14. Two routers with the same address on the bridge
> answer in turn, and an automation tool can then configure the wrong one, so never use an address below .100 here. The dashboard also checks the hostname of every
> router it logs in to and refuses to start a lab whose addresses another router already answers on.


| Node | MGMT IP |
|------|---------|
| gateway (EVE `pnet1` bridge) | 192.168.99.1 |
| CORE-RR1 | 192.168.99.121 |
| CORE-RR2 | 192.168.99.122 |
| EDGE1 | 192.168.99.111 |
| EDGE2 | 192.168.99.112 |
| CE-LAN | 192.168.99.120 |
| ISPA-1 | 192.168.99.131 |
| ISPB-1 | 192.168.99.132 |
| CONTENT | 192.168.99.133 |

Login: `lab / lab123`, enable secret `lab123`, `privilege 15`.
