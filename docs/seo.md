# Public search visibility

Production canonical origin: https://deploypilot-web.vercel.app

The sitemap lists only the homepage and setup guide. Dashboard, login and auth responses use noindex headers; previews also use noindex. Authentication remains responsible for protecting account data. Public pages have distinct titles, descriptions, canonical URLs, one main heading and static JSON-LD. Keywords describe actual GitHub repository deployment and team-owned Docker workers; DeployPilot does not offer free managed hosting.

Google ownership verification succeeded on October 7 using the owner's public HTML tag, which remains in metadata. The sitemap was submitted, and Google's homepage live test reported that the URL is available and can be indexed. The initial sitemap fetch still reported an error despite valid HTTP 200 XML; the owner deferred further sitemap work. Manual indexing hit Google's daily quota and needs a later retry. These processing statuses do not establish an indexed page or ranking. Indexing and rankings depend on Google and useful content, reputation and links; these changes do not guarantee a ranking.

References: https://developers.google.com/search/docs/fundamentals/seo-starter-guide and https://developers.google.com/search/docs/crawling-indexing/block-indexing
