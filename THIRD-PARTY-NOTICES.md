# Third-party notices

The project itself is under the [MIT License](LICENSE). It includes or uses the following third-party material.

## Included in this repository

### Three.js and OrbitControls (`frontend/vendor/`)

`three.min.js` (r128) and `OrbitControls.js` are copies of [Three.js](https://threejs.org/), used for the 3D views.

```
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Used but not included

These are installed separately, under their own licenses (see `backend/requirements.txt` for the Python packages): FastAPI, Uvicorn, HTTPX, Netmiko, ntc-templates, Paramiko, PyYAML, Jinja2, Pydantic and confluent-kafka.
Docker, Kafka, Prometheus, Grafana and EVE-NG are used as separate programs.

## Not included and not licensed by this project

The Cisco IOS images (for example `c7200-adventerprisek9-mz.152-4.S6`) that the labs run on are **not** part of this repository and are not covered by the MIT License.
You need your own licensed copy, and the lab files (`.unl`, configurations) only refer to the image by name. "Cisco" and "IOS" are trademarks of Cisco Systems, Inc.; this project is independent and not affiliated with or endorsed by Cisco.
