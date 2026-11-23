---
layout: null
---
{% capture worker %}{% include_relative web/pwa/service-worker.js %}{% endcapture %}
{{ worker | replace: 'href="/"', 'href="./"' | replace: "url.pathname !== '/'", "url.pathname !== new URL(self.registration.scope).pathname" }}
