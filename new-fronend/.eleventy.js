module.exports = function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("_site/css");

  // Watch CSS output for changes and trigger browser reload
  eleventyConfig.addWatchTarget("_site/css/output.css");
  eleventyConfig.addWatchTarget("src/css/input.css");

  // Shortcode: Chat message (user)
  eleventyConfig.addShortcode("userMessage", function(text, time) {
    return `
<div class="flex justify-end mb-6">
    <div class="max-w-[80%]">
        <div class="text-xs opacity-70 mb-1 px-2">
            You
            ${time ? `<time class="ml-2">${time}</time>` : ''}
        </div>
        <div class="rounded-2xl px-4 py-3 chat-bubble-primary">
            ${text}
        </div>
    </div>
</div>`;
  });

  // Shortcode: Chat message (assistant)
  eleventyConfig.addShortcode("assistantMessage", function(text, time) {
    return `
<div class="flex justify-start mb-6">
    <div class="max-w-[80%]">
        <div class="text-xs opacity-70 mb-1 px-2">
            Claude
            ${time ? `<time class="ml-2">${time}</time>` : ''}
        </div>
        <div class="rounded-2xl px-4 py-3 chat-bubble-secondary">
            ${text}
        </div>
    </div>
</div>`;
  });

  // Shortcode: Tool display
  eleventyConfig.addShortcode("toolUse", function(name, description, downloadUrl) {
    const downloadIcon = downloadUrl ? `
        <a href="${downloadUrl}" class="underline italic">
            ${description}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block ml-1" style="width: 14px; height: 14px; vertical-align: middle;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
        </a>` : `<em>${description}</em>`;

    return `
<div class="glass-tool-display px-4 py-3 mb-2 opacity-70">
    <div class="text-xs font-mono">
        <strong>${name}</strong> — ${downloadIcon}
    </div>
</div>`;
  });

  // Set up directories
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    // Use Nunjucks for HTML files
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    // Server configuration
    serverOptions: {
      port: 8001
    }
  };
};
