// server.js

const express = require("express");
const path = require("path");
const axios = require("axios");

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.get("/", async (req, res) => {
  try {
    const response = await axios.get(
      "https://newsapi.org/v2/top-headlines?country=in&apiKey=679b913ddb014617bcc93a0bb89ee1ee"
    );
    const data = response.data;

    res.render("index", { news: data.articles });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).send("Error fetching news. Please try again later.");
  }
});

app.get("/search", async (req, res) => {
  try {
    const searchTerm = req.query.search;
    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=${searchTerm}&apiKey=679b913ddb014617bcc93a0bb89ee1ee`
    );
    const data = response.data.articles;

    const news = data.filter((dataItem) => dataItem.title?.toLowerCase().includes(searchTerm?.toLowerCase()));

    res.render("index", { news });
  } catch (error) {
    console.error("Error fetching search results:", error);
    res
      .status(500)
      .send("Error fetching search results. Please try again later.");
  }
});

app.get("/sort-by-date", async (req, res) => {
  try {
    const response = await axios.get(
      "https://newsapi.org/v2/top-headlines?country=in&apiKey=679b913ddb014617bcc93a0bb89ee1ee"
    );
    const data = response.data.articles;

    data.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    res.render("index", { news: data });
  } catch (error) {
    console.error("Error sorting articles by date:", error);
    res.status(500).send("Error sorting articles by date. Please try again later.");
  }
});

app.get("/news-by-date", async (req, res) => {
  try {
    const date = req.query.date;
    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=*&from=${date}&to=${date}&sortBy=popularity&apiKey=679b913ddb014617bcc93a0bb89ee1ee`
    );
    const data = response.data.articles;

    res.render("index", { news: data });
  } catch (error) {
    console.error("Error fetching news by date:", error);
    res.status(500).send("Error fetching news by date. Please try again later.");
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
