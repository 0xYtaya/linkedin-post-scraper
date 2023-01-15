import * as LinvoScraper from 'linvo-scraper';
import * as puppeteer from 'puppeteer';
import fs from 'fs';
import ora from 'ora';
import input from 'input';

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

(async () => {
    let email = await input.text("Enter you username:");
    let password = await input.password("Enter you password:");
    let n = await input.text("Enter number of post you want to scrape:");

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });
    const page = (await browser.newPage());
    const cdp = await page.target().createCDPSession();

    // that's the res Linvo is working in production
    await page.setViewport({
        width: 1440,
        height: 900,
    });

    // add ghost-cursor for maximum safety
    await LinvoScraper.tools.loadCursor(page, true);
    let spinner =  ora('Loging').start();

    const {token} = await LinvoScraper.services.login.process(page, cdp, {
        user: email,
        password: password
    })
    await page.setCookie({
        name: "li_at",
        value: token,
        httpOnly: true,
        secure: true,
        sameSite: "None",
        priority: "Medium",
        path: "/",
        domain: ".www.linkedin.com",
    });
    spinner.stop()
    await page.goto('https://www.linkedin.com/search/results/content/?keywords=react%20js&origin=SWITCH_SEARCH_VERTICAL&sid=-UV', { timeout: 0, waitUntil: 'networkidle2' });
    await page.waitForSelector(".reusable-search__entity-result-list > div");
    spinner =  ora('Scrooling for lodoing data').start();
    let ret = await page.evaluate(async (n) => {
        let res = await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                let result = [];
                window.scrollBy(0, distance);
                totalHeight += distance;
                const anchors = Array.from(document.querySelectorAll(".reusable-search__entity-result-list > div"));
                result = [...result, ...anchors];
                if (1 != 1 || result.length >= n) {
                    clearInterval(timer);
                    resolve(Array.from(result).map((el) => "https://www.linkedin.com/feed/update/" + el.getAttribute("data-urn")));
                }
            }, 500);
        },[Number(n)]);
        return res;
    },[Number(n)]);
    spinner.stop()
    ret = ret.filter((el) => !el.includes("null"));
    let data = [];
    for (const link of ret) {
        let actorName;
        let actorprofileurl
        let content;
        let src;
        let comments;
        spinner = ora(`Srcaping data from ${link}`).start();
        await page.goto(link, { timeout: 0, waitUntil: 'networkidle2' });
        try {
            actorName = await page.$eval(".update-components-actor > a > div[class='update-components-actor__meta relative'] > span > span > span", el => el.innerText);
        }
        catch (err) { }
        try {
            actorprofileurl = await page.$eval(".update-components-actor > a", el => el.getAttribute("href"));
        }
        catch (err) { }
        try {
            content = await page.$eval(".update-components-text", el => el.querySelector("span[class='break-words']").innerText);
        }
        catch (err) { }
        try {
            src = await page.$eval(".update-components-image", (el) => {
                let result = el.querySelectorAll("img");
                return Array.from(result).map((img) => img.getAttribute("src"));
            });
        }
        catch (err) { }
        if (!src) {
            try {
                src = await page.$eval(".update-components-linkedin-video", (el) => {
                    let result = el.querySelectorAll("video");
                    return Array.from(result).map((video) => video.getAttribute("src"));
                });
            }
            catch (err) { }
        }
        if (!src) {
            try {
                let iframe = await page.$("iframe");
                let frame = await iframe.contentFrame();
                let href = await frame.$eval(".ssplayer-virus-scan-container__download-button", (el) => el.getAttribute("href"));
                src = [href];
            }
            catch (err) { }
        }
        try {
            comments = await page.$$eval(".comments-comment-item", (el) => {
                return Array.from(el).map((comment) => {
                    let name = comment.querySelector(".comments-post-meta__name-text").innerText;
                    let profile = "https://www.linkedin.com" + comment.querySelector(".comments-post-meta__actor-link").getAttribute("href");
                    let content = comment.querySelector(".update-components-text").innerText;
                    return { name, profile, content };
                });
            })
        }
        catch (err) { }
        spinner.stop()
        data.push({ "post": { post_url: link, name: actorName, p_url: actorprofileurl, content: content, src: src, comments: comments } });
        spinner = ora('Waiting for 10 seconds').start();
        await sleep(1000 * 10);
        spinner.stop()
    }
    fs.writeFile('data.json', JSON.stringify(data), (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    await browser.close();
})();