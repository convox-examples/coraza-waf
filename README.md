# Coraza WAF Example for Convox

A web application firewall (WAF) using [Coraza](https://www.coraza.io/) and the [OWASP Core Rule Set](https://coreruleset.org/) deployed as a reverse proxy service in front of your application on Convox.

This example demonstrates how to protect a backend service with an in-cluster WAF that blocks common web attacks — SQL injection, cross-site scripting (XSS), local file inclusion, and more — without any changes to your application code. The WAF runs as a separate Convox service using a pre-built Docker image maintained by the OWASP CRS project, so there's nothing to compile or patch.

Deploy to Convox Cloud for a fully-managed platform experience, or to your own Convox Rack for complete control over your infrastructure. Either way, you'll get automatic SSL, load balancing, and zero-downtime deployments out of the box.

## How It Works

```
Internet → NLB → nginx ingress → waf service (Caddy + Coraza) → web service (internal)
```

The `waf` service is the public-facing entry point. It inspects every request through Coraza and the OWASP Core Rule Set, then forwards clean traffic to the `web` service. Setting `internal: true` on `web` ensures nothing bypasses the WAF.

## Deploy to Convox Cloud

1. **Create a Cloud Machine** at [console.convox.com](https://console.convox.com)

2. **Create the app**:
```bash
convox cloud apps create coraza-waf -i your-machine-name
```

3. **Deploy the app**:
```bash
convox cloud deploy -a coraza-waf -i your-machine-name
```

4. **View your app**:
```bash
convox cloud services -a coraza-waf -i your-machine-name
```

## Deploy to Convox Rack

1. **Create the app**:
```bash
convox apps create coraza-waf
```

2. **Deploy the app**:
```bash
convox deploy -a coraza-waf
```

3. **View your app**:
```bash
convox services -a coraza-waf
```

## Test the WAF

Once deployed, grab the WAF service URL from `convox services` output.

```bash
WAF_URL="https://your-waf-url"

# Normal request — should return 200
curl -sk "$WAF_URL/"

# SQL injection — should return 403 when enforcement is on
curl -sk "$WAF_URL/?id=1%20OR%201=1--"

# XSS — should return 403 when enforcement is on
curl -sk "$WAF_URL/?q=<script>alert(1)</script>"

# .env probe — should return 403 when enforcement is on
curl -sk "$WAF_URL/.env"
```

In `DetectionOnly` mode (the default in this example), all requests pass through but malicious ones are logged. Switch to enforcement mode to start blocking.

## Configuration

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORAZA_RULE_ENGINE` | `DetectionOnly` | `DetectionOnly` logs without blocking. `On` enforces rules. |
| `PARANOIA` | `1` | CRS paranoia level (1-4). Higher = more rules, more false positives. |
| `BACKEND` | `web:3000` | Backend service address. Use the Convox service name and port. |
| `PORT` | `8080` | Port the WAF container listens on. |
| `ANOMALY_INBOUND` | `5` | Anomaly score threshold before a request is blocked. |

### Recommended Rollout

1. **Start in detection-only mode** (the default):
```yaml
    environment:
      - CORAZA_RULE_ENGINE=DetectionOnly
      - PARANOIA=1
```

2. **Watch the logs** for what Coraza flags:
```bash
convox logs -a coraza-waf | grep "transaction"
```

3. **Tune out false positives** by adding custom rule exclusions (see [Custom Rules](#custom-rules) below).

4. **Enable enforcement**:
```bash
convox env set CORAZA_RULE_ENGINE=On -a coraza-waf
```

5. **Raise paranoia level** once stable:
```bash
convox env set PARANOIA=2 -a coraza-waf
```

### Paranoia Levels

| Level | Coverage | False Positives | Best For |
|-------|----------|-----------------|----------|
| 1 | Catches obvious attacks | Very few | Getting started |
| 2 | Broader coverage | Some tuning needed | Most production apps |
| 3 | Extensive rules | Significant tuning | High-security environments |
| 4 | Maximum coverage | Expect heavy tuning | Compliance-driven use cases |

## Adapting to Your Application

Replace the example backend with your own service. The only changes needed are in `convox.yml`:

```yaml
services:
  waf:
    build: ./waf
    port: 8080
    health: /
    environment:
      - CORAZA_RULE_ENGINE=DetectionOnly
      - PARANOIA=1
      - BACKEND=web:3000
      - PORT=8080
    scale:
      count: 2
      memory: 512
  web:
    build: .
    port: 3000
    internal: true
```

Point `BACKEND` to your service name and port. Convox configures DNS search domains on every pod, so the bare service name resolves automatically within the same app — no need for a fully-qualified domain name.

## Custom Rules

The WAF image supports two directories for customization, loaded at different times:

| Directory | Loaded | Use For |
|-----------|--------|---------|
| `/opt/coraza/config.d/` | **Before** CRS rules | Rule exclusions (`ctl:ruleRemoveById`) |
| `/opt/coraza/rules.d/` | **After** CRS rules | Additional rules, blanket removals |

This distinction matters: conditional exclusions using `ctl:ruleRemoveById` must go in `config.d/` so they load before the rules they're suppressing. Putting them in `rules.d/` will not work.

### Included Exclusions

This example ships with a `config.d/convox-exclusions.conf` that suppresses false positives from normal Convox platform behavior:

- **Rule 920350** (Host header is numeric IP) — Kubernetes health checks hit the pod IP directly, so the Host header is always a numeric IP. This is expected behavior, not an attack. The exclusion only applies to requests with a `kube-probe` user-agent so normal traffic is unaffected.

### Adding Your Own Exclusions

Edit `waf/custom-rules/application-exclusions.conf` to add exclusions specific to your application. The file includes commented-out examples for common patterns:

**Exclude a rule for a specific URL path** — when an endpoint legitimately triggers a rule (e.g., a search endpoint with complex query strings):

```
SecRule REQUEST_URI "@beginsWith /api/search" \
    "id:1000100,\
    phase:1,\
    pass,\
    nolog,\
    ctl:ruleRemoveById=942100"
```

**Exclude a rule for a specific parameter** — when a form field contains content that looks like an attack (e.g., a rich text editor that sends HTML):

```
SecRule REQUEST_URI "@beginsWith /api/posts" \
    "id:1000101,\
    phase:1,\
    pass,\
    nolog,\
    ctl:ruleRemoveTargetById=941100;ARGS:body,\
    ctl:ruleRemoveTargetById=941160;ARGS:body"
```

**Blanket-remove a rule entirely** — as a last resort when a rule causes widespread false positives:

```
SecRuleRemoveById 920300
```

Note: if your exclusion uses `ctl:ruleRemoveById` or `ctl:ruleRemoveTargetById`, move it to `waf/config.d/` instead. Blanket removals with `SecRuleRemoveById` work from either directory.

### WAF Directory Structure

```
waf/
├── Dockerfile                              # Extends the base Coraza CRS image
├── config.d/
│   └── convox-exclusions.conf              # Platform exclusions (loaded before CRS)
└── custom-rules/
    └── application-exclusions.conf         # Your app-specific exclusions (loaded after CRS)
```

On startup you'll see confirmation that both directories were loaded:

```
- User configuration files loaded from /opt/coraza/config.d
- User defined rule sets loaded from /opt/coraza/rules.d
```

## Project Structure

```
.
├── convox.yml              # Convox deployment configuration
├── waf/
│   ├── Dockerfile          # Extends Coraza CRS with custom rules
│   ├── config.d/           # Rule exclusions (loaded before CRS rules)
│   │   └── convox-exclusions.conf
│   └── custom-rules/       # Additional rules (loaded after CRS rules)
│       └── application-exclusions.conf
└── backend/
    ├── Dockerfile          # Simple Node.js backend
    └── server.js           # Example application server
```

## Why Caddy Over Nginx

The Coraza CRS Docker project offers both nginx and caddy variants. This example uses caddy-alpine because:

- **Dynamic DNS resolution** — Caddy resolves backend addresses on each request. Nginx resolves at startup and crashes if the backend isn't ready yet, which is a common race condition in Kubernetes.
- **Smaller image** — Alpine-based, lighter footprint.
- **Same WAF behavior** — Both variants use identical Coraza and CRS rule sets.

## Scaling

### Convox Cloud
```bash
convox cloud scale waf --count 3 --cpu 512 --memory 1024 -a coraza-waf -i your-machine-name
```

### Convox Rack
```bash
convox scale waf --count 3 --cpu 512 --memory 1024 -a coraza-waf
```

Scale the WAF and backend services independently based on traffic patterns.

## Common Commands

### View WAF audit logs

Cloud:
```bash
convox cloud logs -a coraza-waf -i your-machine-name | grep "transaction"
```

Rack:
```bash
convox logs -a coraza-waf | grep "transaction"
```

### Access container shell

Cloud:
```bash
convox cloud exec waf sh -a coraza-waf -i your-machine-name
```

Rack:
```bash
convox run waf sh -a coraza-waf
```

## Further Reading

- [OWASP Coraza WAF](https://www.coraza.io/) — Project home
- [coraza-crs Docker image](https://github.com/coreruleset/coraza-crs-docker) — Pre-built Caddy/nginx + Coraza + CRS
- [CRS documentation](https://coreruleset.org/docs/) — Rule tuning, paranoia levels, exclusions
- [Coraza Caddy module](https://github.com/corazawaf/coraza-caddy) — The underlying Caddy plugin
