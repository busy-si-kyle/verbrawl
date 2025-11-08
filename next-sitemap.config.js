/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'http://localhost:3000', // Replace with your production domain
  generateRobotsTxt: true, // Generate robots.txt file
  changefreq: 'daily',
  priority: 0.7,
  sitemapSize: 5000,
  exclude: [
    '/api/*', // Exclude API routes
    '/server-sitemap.xml', // Exclude server sitemap
  ],
};