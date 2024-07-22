import { ReclaimClient } from '../src'
import { config } from 'dotenv'
config()

export const getEthPrice = async () => {
    // Get your APP_ID and APP_SECRET from the Reclaim Devtool (https://dev.reclaimprotocol.org/) 
    const reclaim = new ReclaimClient(process.env.APP_ID!, process.env.APP_SECRET!, true)
    const options = {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
        }
    }
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    return await reclaim.zkFetch(url, options)
}