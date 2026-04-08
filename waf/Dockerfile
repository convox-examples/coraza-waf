FROM ghcr.io/coreruleset/coraza-crs:caddy-alpine

# Rule exclusions (loaded BEFORE crs-setup.conf — required for ctl:ruleRemoveById)
COPY config.d/ /opt/coraza/config.d/

# Paranoia level override (loaded AFTER crs-setup.conf, BEFORE CRS rules)
COPY plugins/ /opt/coraza/plugins/

# Additional custom rules (loaded AFTER CRS rules)
COPY custom-rules/ /opt/coraza/rules.d/
