FROM ghcr.io/coreruleset/coraza-crs:caddy-alpine

# Rule exclusions (loaded BEFORE CRS rules — required for ctl:ruleRemoveById)
COPY config.d/ /opt/coraza/config.d/

# Additional custom rules (loaded AFTER CRS rules)
COPY custom-rules/ /opt/coraza/rules.d/
