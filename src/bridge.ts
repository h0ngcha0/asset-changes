import { NodeProvider, Token, TransactionBuilder, web3, Number256 } from '@alephium/web3'


interface Asset {
  address: Number256
  attoAlphAmount: Number256
  tokens: Token[]
}

function addTokens(existingTokens: Token[], newTokens: Token[]) {
  newTokens.forEach(newToken => {
    const index = existingTokens.findIndex(t => t.id === newToken.id)
    if (index >= 0) {
      existingTokens[index].amount = (BigInt(existingTokens[index].amount) + BigInt(newToken.amount)).toString()
    } else {
      existingTokens.push(newToken)
    }
  })
}

function calculateTotalAssets(assets: Asset[]): Asset[] {
  const result: Asset[] = []
  assets.forEach(asset => {
    const index = result.findIndex((r) => r.address === asset.address)
    if (index >= 0) {
      result[index].attoAlphAmount = (BigInt(result[index].attoAlphAmount) + BigInt(asset.attoAlphAmount))
      addTokens(result[index].tokens, asset.tokens)
    } else {
      result.push(asset)
    }
  })

  return result
}

function calculateAssetDiff(generatedOutputs: Asset[], contractInputs: Asset[]) {
  let alphDiffs = 0n
  const tokenDiffs = new Map<string, bigint>()
  generatedOutputs.forEach(output => {
    alphDiffs += BigInt(output.attoAlphAmount)
    output.tokens.forEach(token => {
      const currentAmount = tokenDiffs.get(token.id) || 0n
      tokenDiffs.set(token.id, currentAmount + BigInt(token.amount))
    })
  })

  contractInputs.forEach(input => {
    alphDiffs -= BigInt(input.attoAlphAmount)
    input.tokens.forEach(token => {
      const currentAmount = tokenDiffs.get(token.id) || 0n
      tokenDiffs.set(token.id, currentAmount - BigInt(token.amount))
    })
  })

  return { alphDiffs, tokenDiffs }
}


async function bridge() {
  web3.setCurrentNodeProvider('https://node.testnet.alephium.org', undefined, fetch)
  const nodeProvider = web3.getCurrentNodeProvider()
  const signerAddress = "12aH6to1JQxDFsvJ89jtFCnKEcub5ew8x2EABGEDMTYyK"
  const signerPublicKey = "034e30eb5dd78000bcbe276e1202d0dc5499398321cc160cc8b10f2a71ffdfe7ca"

  const result = await TransactionBuilder.from(nodeProvider).buildExecuteScriptTx(
    {
      signerAddress: signerAddress,
      bytecode: "0101030001001a0c0d1440204c91e8825fcfea5219cf6a5b4f1607db7f0bd22850f39ed87dad9445bd99a800010a1700150017620f4cdd77b8e469a5ec08a6744c6334410684a9ee91835ac27ae27f3be3ae7a1600a21440208f8cc15f28a76f2a2a0400a49691a645b2ba2287fa415c9612417a0403fb650013c32aa1efb94e0000a3150017620f4cdd77b8e469a5ec08a6744c6334410684a9ee91835ac27ae27f3be3ae144020000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd101014144eab0e005861f1561effb5181c279817159837b713c32aa1efb94e000016000c140463780100130a130a0c1440204c91e8825fcfea5219cf6a5b4f1607db7f0bd22850f39ed87dad9445bd99a8000110",
      attoAlphAmount: "100000000000000",
      tokens: [
        {
          id: "8f8cc15f28a76f2a2a0400a49691a645b2ba2287fa415c9612417a0403fb6500",
          amount: "12000000000000000"
        },
        {
          id: "0000000000000000000000000000000000000000000000000000000000000000",
          amount: "2000000000000000"
        }
      ]
    },
    signerPublicKey
  )

  const simulationResult = result['simulationResult']

  // Filter out the signer's generated outputs
  const nonSignerGeneratedOutputs = simulationResult.generatedOutputs.filter(output => output.address !== signerAddress)
  // In generated outputs, there could have multiple assets with the same address
  const generatedOutputs = calculateTotalAssets(nonSignerGeneratedOutputs)
  // In contract inputs, each asset is unique in terms of address
  const contractInputs = simulationResult.contractInputs

  const { alphDiffs, tokenDiffs } = calculateAssetDiff(generatedOutputs, contractInputs)
  if (alphDiffs > 0n) {
    console.log(`${signerAddress} is sending out ${alphDiffs} atto alph`)
  } else if (alphDiffs < 0n) {
    console.log(`${signerAddress} is receiving ${alphDiffs} atto alph`)
  }

  tokenDiffs.forEach((amount, tokenId) => {
    if (amount > 0n) {
      console.log(`${signerAddress} is sending out ${amount} token ${tokenId}`)
    } else if (amount < 0n) {
      console.log(`${signerAddress} is receiving ${amount} token${tokenId}`)
    }
  })
}

bridge()