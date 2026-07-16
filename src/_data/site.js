const site = {
  title: "tollmanz.com",
  description: "tollmanz's personal website",
  url: "https://www.tollmanz.com",
  author: {
    name: "Zack Tollman",
    email: "tollmanz@gmail.com",
    github: "tollmanz",
    mastodon: "https://indieweb.social/@tollmanz",
  },
};

// Validate critical fields at build time. These values feed canonical URLs,
// feed metadata, and Open Graph tags, so a missing or malformed value ships
// broken SEO/social markup to every page. Warn loudly rather than throwing so a
// typo never blocks a deploy of otherwise-good content.
function validateSite(data) {
  const problems = [];

  for (const key of ["title", "description", "url"]) {
    if (typeof data[key] !== "string" || data[key].trim() === "") {
      problems.push(`site.${key} must be a non-empty string`);
    }
  }

  if (typeof data.url === "string") {
    try {
      const { protocol } = new URL(data.url);
      if (protocol !== "https:" && protocol !== "http:") {
        problems.push("site.url must use the http or https protocol");
      }
    } catch {
      problems.push("site.url must be a valid absolute URL");
    }
  }

  if (!data.author || typeof data.author !== "object") {
    problems.push("site.author must be an object");
  } else {
    if (
      typeof data.author.name !== "string" ||
      data.author.name.trim() === ""
    ) {
      problems.push("site.author.name must be a non-empty string");
    }
    if (
      typeof data.author.email !== "string" ||
      !data.author.email.includes("@")
    ) {
      problems.push("site.author.email must be a valid email address");
    }
  }

  for (const problem of problems) {
    console.warn(`[site data] ${problem}`);
  }
}

validateSite(site);

export default site;
