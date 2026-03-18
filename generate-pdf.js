
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8099/documentacao-tecnica-aiox.html', { waitUntil: 'networkidle0' });
  await page.pdf({
    path: '/Users/rodrigo/Desktop/documentacao-tecnica-aiox.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
  await browser.close();
  console.log('PDF salvo em ~/Desktop/documentacao-tecnica-aiox.pdf');
})();
