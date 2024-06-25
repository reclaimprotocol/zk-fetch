
import { ethers, Wallet } from 'ethers'
import { randomBytes } from 'crypto'


export const generateWallet = async () => {
  const bytes = randomBytes(32).toString('hex')
  const wallet = new Wallet(bytes)
  const address = wallet.address

  return {
    privateKey: wallet.privateKey,
    address,
  }
}


export const getWalletFromPrivateKey = (privateKey: string) => {
  if(!privateKey) {
    throw new Error('pass a private key')
  }
  try {
  const wallet = new ethers.Wallet(privateKey)
  return wallet
  } catch (err) {
    throw new Error('Invalid key')
  }
}