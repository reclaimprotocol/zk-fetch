
import { ethers } from 'ethers'

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