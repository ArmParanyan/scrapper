import express from "express";
import puppeteer from "puppeteer";
import mongoose from "mongoose";

const url = "mongodb://127.0.0.1:27017/wiki";
const app = express();
const port = process.env.PORT || 3001;

mongoose.set({strictQuery: false});
mongoose.connect(url);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("Connected to MongoDB successfully");
});

const docsSchema = new mongoose.Schema({
  url: {
    type: String
  },
  title: {
    type: String
  },
  summary: {
    type: String
  },
});

const wordSchema = new mongoose.Schema({
  word: {
    type: String
  },
  urlId: {
    type: []
  },
});

const documents = mongoose.model("documents", docsSchema);
const words = mongoose.model("words", wordSchema);


async function scrapeWikipedia(query) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const pageUrl = `https://en.wikipedia.org/wiki/${query}`;
  await page.goto(pageUrl);
  let struct = new documents;
  const [title, summary] = await page.evaluate(() => {
    const title = document.title;
    const paragraphs = document.querySelectorAll('#mw-content-text > div > p');
    let summary;

    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].textContent.trim() !== '') {
      summary = paragraphs[i].textContent;
      break;
      }
    }  
    return [title, summary];
  });
  struct.title = title;
  struct.url = pageUrl;
  struct.summary = summary;
  await documents.updateOne({url: pageUrl}, {$set: {title: struct.title, summary: struct.summary}}, {upsert: true})
  .then(async(result) => {
    if (result.upsertedId) {
      const forParse = await page.evaluate(() => {
        let content = Array.from(document.querySelectorAll("h1, h2, p"))
        .map(content => content.textContent)
        .filter(el => el.length !== 0);
        return content;
      });
      let parsed = forParse.toString().split(/[,.;:"'\n( \t){}]/).filter(el => el.length !== 0);
      await inverting_content(result.upsertedId, parsed);
      console.log("inserted");
    }
  })
  .catch(err => console.error(err));
  
  await browser.close();

  return struct.title;
}

async function inverting_content(id, data) {
  const struct = new words;
  for (let key in data) {
    await words.updateOne({word: data[key], urlId: {$ne: id}}, {$push: {urlId: id}}, {upsert: true})
    .then()
    .catch(err => console.error(err));
  }
}

app.get("/", (req, res) => {
    scrapeWikipedia(req.query.q).then((data) => {
        res.send(data);
    });
});

app.listen(port);