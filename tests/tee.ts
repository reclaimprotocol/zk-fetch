import { ReclaimClient } from '../src'
import { config } from 'dotenv'
config()

/**
 * Fetches ETH price using TEE mode (Binance API)
 */
export const getEthPriceWithTee = async () => {
    const reclaim = new ReclaimClient(
        process.env.APP_ID!,
        process.env.APP_SECRET!,
        false
    )
    const options = {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
        },
        context: {
            contextAddress: "0x0000000000000000000000000000000000000000",
            contextMessage: "eth_price_tee"
        },
        useTee: true
    }
    const privateOptions = {
        responseMatches: [{
            type: 'regex' as const,
            value: '"price":"(?<price>[\\d\\.]+)"',
        }],
        responseRedactions: [{ regex: '"price":"(?<price>[\\d\\.]+)"' }],
    }
    const url = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";
    return await reclaim.zkFetch(url, options, privateOptions)
}

/**
 * Creates a TEE-enabled ReclaimClient
 */
export const createTeeClient = (logs = false) => {
    return new ReclaimClient(
        process.env.APP_ID!,
        process.env.APP_SECRET!,
        logs
    )
}

/**
 * Creates a non-TEE ReclaimClient
 */
export const createNonTeeClient = (logs = false) => {
    return new ReclaimClient(
        process.env.APP_ID!,
        process.env.APP_SECRET!,
        logs
    )
}

/**
 * Fetches BTC price using CoinDesk API (different from CoinGecko)
 */
export const getBtcPriceWithTee = async () => {
    const reclaim = createTeeClient()
    const options = {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
        },
        context: {
            contextAddress: "0x0000000000000000000000000000000000000000",
            contextMessage: "btc_price_tee"
        },
        useTee: true
    }
    const privateOptions = {
        responseMatches: [{
            type: 'regex' as const,
            value: '"USD":\\{"code":"USD","rate":"(?<price>[\\d,\\.]+)"',
        }],
        responseRedactions: [{ regex: '"USD":\\{"code":"USD","rate":"(?<price>[\\d,\\.]+)"' }],
    }
    const url = "https://api.coindesk.com/v1/bpi/currentprice.json";
    return await reclaim.zkFetch(url, options, privateOptions)
}