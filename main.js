import * as fs from 'fs';
import request from 'request';
import { DateTime } from 'luxon';
import writeXlsxFile from 'write-excel-file/node';
import { config } from 'dotenv';

config();
const readStream = fs.createReadStream(`./${process.env.TICKER_FILE}`, 'utf-8');
const errorStream = fs.createWriteStream('./err.txt');

const tickersList = [];
readStream.on('data', async data => {
    const list = data.split('\r\n');
    console.info('Processing inputs');
    for (let ticker of list) {
        const p1 = ticker.indexOf('(');
        const p2 = ticker.indexOf(')');
        tickersList.push(ticker.substring(p1 + 1, p2));
    }

    const excelData = [];
    const schema = [
        {
            column: 'Ticker',
            type: String,
            value: obj => obj.ticker
        },
        {
            column: 'High',
            type: Number,
            format: '#,##0.00',
            value: obj => obj.high
        },
        {
            column: 'Low',
            type: Number,
            format: '#,##0.00',
            value: obj => obj.low
        }
    ];
    for (let ticker of tickersList) {
        const date = DateTime.fromISO(process.env.TICKER_DATE).startOf('day');
        const startUnix = date.toUnixInteger();
        const endUnix = date.plus({hours: 12}).toUnixInteger();
        const url = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${startUnix}&to=${endUnix}&token=${process.env.API_TOKEN}`;

        request.get({
            url: url,
            json: true,
            headers: {'User-Agent': 'request'}
        }, (err, res, data) => {
            if (err) {
                console.log('Error:', err);
                errorStream.write(`${ticker}\n`);
            } else if (res.statusCode !== 200) {
                console.log('Status:', res.statusCode);
                errorStream.write(`${ticker}: ${res.statusCode}\n`);
            } else {
                try {
                    // data is successfully parsed as a JSON object:
                    excelData.push({
                        ticker,
                        high: Number(data['h']),
                        low: Number(data['l'])
                    });
                    console.info(`${ticker} | High: $${data['h']}, Low: $${data['l']}\n`);
                } catch (e) {
                    console.error(`Shit broke on ${ticker}`);
                    errorStream.write(`${ticker}\n`);
                }
            }
        });
        await new Promise(resolve => setTimeout(resolve, 2050));
    }
    await writeXlsxFile(excelData, {
        schema,
        filePath: `./ticker-data(${process.env.TICKER_DATET})_${DateTime.now().toFormat('yyyyMMddHHmmss')}.xlsx`,
        stickyRowsCount: 1,
    });
    errorStream.close();
    readStream.close();
});
