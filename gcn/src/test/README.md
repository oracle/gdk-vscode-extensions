
# Proxy setup

In case of network behind the proxy, the following variables must be set:

- http_proxy - URL to proxy, incl. protocol and port, e.g. http://acme.com:80
- no_proxy   - URL patterns that must not use proxy

Internally (in package.json), the globalAgent/bootstrap is used with GLOBAL_AGENT_{HTTP,NO}_PROXY
set to the appropriate env variable.
