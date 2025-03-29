const express = require("express");
const path = require("path");
const axios = require("axios");
const moment = require("moment");
const cors = require("cors");
const serverless = require('serverless-http');
// Initialize Express app
const app = express();

// Middleware

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.url = req.url.replace(/^\/\.netlify\/functions\/server/, "");
  next();
});
//app.use(express.static(path.join(__dirname, '../public')));
//let file = require("../views/index.ejs");
// View engine setup
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "ejs");

// API key (consider using environment variables for production)
const API_KEY = "679b913ddb014617bcc93a0bb89ee1ee";
const BASE_URL = "https://newsapi.org/v2";

// Cache for API responses (simple in-memory cache)
const cache = {
  data: {},
  timeouts: {},
  set: function(key, value, ttl = 10 * 60 * 1000) { // Default TTL: 10 minutes
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
    }
    
    this.data[key] = value;
    this.timeouts[key] = setTimeout(() => {
      delete this.data[key];
      delete this.timeouts[key];
    }, ttl);
  },
  get: function(key) {
    return this.data[key];
  },
  has: function(key) {
    return key in this.data;
  }
};

// Utility function to fetch news with caching
async function fetchNewsWithCache(url, cacheKey) {
  if (cache.has(cacheKey)) {
    console.log(`Cache hit for: ${cacheKey}`);
    return cache.get(cacheKey);
  }
  
  console.log(`Cache miss for: ${cacheKey}, fetching from API: ${url}`);
  try {
    const response = await axios.get(url);
    const data = response.data;
    
    console.log("FINAL-URL:", url);
    // Cache the results
    cache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error.message);
    throw error;
  }
}

// Format article data
function formatArticles(articles) {
  if (!articles) return [];
  
  return articles.map(article => {
    // Ensure we have all required fields, or provide defaults
    return {
      ...article,
      title: article.title || "No title available",
      description: article.description || "No description available",
      publishedAt: article.publishedAt || new Date().toISOString(),
      url: article.url || "#",
      urlToImage: article.urlToImage || null,
      source: article.source || { id: null, name: "Unknown Source" }
    };
  });
}

// Get current date in YYYY-MM-DD format
function getCurrentDate() {
  return moment().format('YYYY-MM-DD');
}

// Home route - Default to everything endpoint with current date
app.get("/", async (req, res) => {
  try {
    const currentDate = getCurrentDate();
    // Use the everything endpoint with current date filter and US news
    const url = `${BASE_URL}/everything?q=us&language=en&sortBy=publishedAt&apiKey=${API_KEY}`;
    const cacheKey = `everything-us-today-${currentDate}`;
    
    let data;
    try {
      data = await fetchNewsWithCache(url, cacheKey);
    } catch (error) {
      console.log("Error fetching current date news, falling back to top headlines:", error.message);
      // Fallback to top headlines if everything endpoint returns no results
      const fallbackUrl = `${BASE_URL}/top-headlines?country=us&apiKey=${API_KEY}`;
      data = await fetchNewsWithCache(fallbackUrl, `top-headlines-us-${currentDate}`);
    }
    
    const formattedArticles = formatArticles(data.articles);
    
    res.render("index", { 
      news: formattedArticles,
      currentPage: "home",
      currentDate: currentDate
    });
  } catch (error) {
    console.error("Error fetching news:", error.message);
    res.status(500).render("error", { 
      message: "Error fetching news. Please try again later.",
      error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
    });
  }
});

// Search route - with date filtering
app.get("/search", async (req, res) => {
  try {
    const searchTerm = req.query.search?.trim();
    const date = req.query.date || getCurrentDate();
    const category = req.query.category || "";
    
    if (!searchTerm) {
      return res.redirect("/");
    }
    
    let url;
    let cacheKey;
    
    if (category) {
      // If category is provided, search within that category
      url = `${BASE_URL}/top-headlines?q=${encodeURIComponent(searchTerm)}&language=en&apiKey=${API_KEY}`;
      cacheKey = `search-category-${searchTerm}-${category}`;
    } else {
      // Otherwise search everything with date filter
      url = `${BASE_URL}/everything?q=${encodeURIComponent(searchTerm)}&from=${date}&to=${date}&language=en&sortBy=relevancy&apiKey=${API_KEY}`;
      cacheKey = `search-date-${searchTerm}-${date}`;
    }
    
    let data;
    try {
      data = await fetchNewsWithCache(url, cacheKey);
    } catch (error) {
      console.log("Error with search query, trying more relaxed search:", error.message);
      // If no results with date filter, try without date filter
      const fallbackUrl = `${BASE_URL}/everything?q=${encodeURIComponent(searchTerm)}&sortBy=relevancy&apiKey=${API_KEY}`;
      data = await fetchNewsWithCache(fallbackUrl, `search-fallback-${searchTerm}`);
    }
    
    let articles = data.articles || [];
    const formattedArticles = formatArticles(articles);
    
    res.render("index", { 
      news: formattedArticles, 
      searchTerm: searchTerm,
      category: category,
      currentDate: date,
      currentPage: "search"
    });
  } catch (error) {
    console.error("Error fetching search results:", error.message);
    res.status(500).render("error", { 
      message: "Error fetching search results. Please try again later.",
      error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
    });
  }
});

// Sort by date route
app.get("/sort-by-date", async (req, res) => {
  try {
    const currentDate = getCurrentDate();
    const category = req.query.category || "";
    
    let url, cacheKey;
    
    if (category) {
      url = `${BASE_URL}/top-headlines?category=${category}&language=en&apiKey=${API_KEY}`;
      cacheKey = `top-headlines-category-${category}`;
    } else {
      url = `${BASE_URL}/everything?q=USA OR America&from=${currentDate}&to=${currentDate}&language=en&sortBy=publishedAt&apiKey=${API_KEY}`;
      cacheKey = `everything-date-sorted-${currentDate}`;
    }
    
    let data;
    try {
      data = await fetchNewsWithCache(url, cacheKey);
    } catch (error) {
      console.log("Error sorting by date, falling back to top headlines:", error.message);
      const fallbackUrl = `${BASE_URL}/top-headlines?country=us&apiKey=${API_KEY}`;
      data = await fetchNewsWithCache(fallbackUrl, `top-headlines-us-sorted-${currentDate}`);
    }
    
    let articles = data.articles || [];
    
    // Sort by date (newest first)
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    
    const formattedArticles = formatArticles(articles);
    
    res.render("index", { 
      news: formattedArticles,
      currentPage: "sorted",
      category: category,
      currentDate: currentDate
    });
  } catch (error) {
    console.error("Error sorting articles by date:", error.message);
    res.status(500).render("error", { 
      message: "Error sorting articles by date. Please try again later.",
      error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
    });
  }
});

// News by date route
app.get("/news-by-date", async (req, res) => {
  try {
    const date = req.query.date || getCurrentDate();
    const category = req.query.category || "";
    
    let url, cacheKey;
    
    if (category) {
      // If category is provided, get news for that category
      url = `${BASE_URL}/top-headlines?category=${category}&language=en&apiKey=${API_KEY}`;
      cacheKey = `category-date-${category}-${date}`;
    } else {
      // Otherwise get everything for that date
      url = `${BASE_URL}/everything?q=USA OR America&from=${date}&to=${date}&language=en&sortBy=publishedAt&apiKey=${API_KEY}`;
      cacheKey = `news-by-date-${date}`;
    }
    
    let data;
    try {
      data = await fetchNewsWithCache(url, cacheKey);
    } catch (error) {
      console.log("Error fetching news by date, trying top headlines:", error.message);
      const fallbackUrl = `${BASE_URL}/top-headlines?country=us&apiKey=${API_KEY}`;
      data = await fetchNewsWithCache(fallbackUrl, `top-headlines-fallback-${date}`);
    }
    
    const formattedArticles = formatArticles(data.articles);
    
    res.render("index", { 
      news: formattedArticles,
      date: date,
      category: category,
      currentDate: date,
      currentPage: "by-date"
    });
  } catch (error) {
    console.error("Error fetching news by date:", error.message);
    res.status(500).render("error", { 
      message: "Error fetching news by date. Please try again later.",
      error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
    });
  }
});

// Categories route
app.get("/categories", async (req, res) => {
  try {
    const category = req.query.category || "general";
    const date = req.query.date || getCurrentDate();
    
    const url = `${BASE_URL}/top-headlines?category=${category}&language=en&apiKey=${API_KEY}`;
    const cacheKey = `category-${category}-${date}`;
    
    const data = await fetchNewsWithCache(url, cacheKey);
    const formattedArticles = formatArticles(data.articles);
    
    res.render("index", { 
      news: formattedArticles,
      category: category,
      currentDate: date,
      currentPage: "categories"
    });
  } catch (error) {
    console.error("Error fetching category news:", error.message);
    res.status(500).render("error", { 
      message: "Error fetching category news. Please try again later.",
      error: { status: 500, stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
    });
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found',
    error: { status: 404 }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports.handler = serverless(app);