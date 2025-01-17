import { binToHex, bs58, codec, hexToBinUnsafe, NodeProvider, node, Token, TransactionBuilder, web3 } from '@alephium/web3'

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

async function calculateInputAssets(
  nodeProvider: NodeProvider,
  fixedInputs: codec.Input[],
  signerAddress: string
): Promise<[bigint, Token[]]> {
  var inputAlph = 0n
  const inputTokens: Token[] = []
  for (const input of fixedInputs) {
    const txId = await nodeProvider.transactions.getTransactionsTxIdFromOutputref({
      hint: input.hint,
      key: binToHex(input.key)
    })
    const txDetails = await nodeProvider.transactions.getTransactionsDetailsTxid(txId)
    txDetails.generatedOutputs.forEach((output) => {
      if (output.address === signerAddress) {
        inputAlph += BigInt(output.attoAlphAmount)
        addTokens(inputTokens, output.tokens)
      }
    })
    txDetails.unsigned.fixedOutputs.forEach((output) => {
      if (output.address === signerAddress) {
        inputAlph += BigInt(output.attoAlphAmount)
        addTokens(inputTokens, output.tokens)
      }
    })
  }

  return [inputAlph, inputTokens]
}

async function calculateOutputAssets(
  fixedOutputs: codec.assetOutput.AssetOutput[],
  simulatedOutputs: node.Output[],
  signerAddress: string
): Promise<[bigint, Token[]]> {
  var outputAlph = 0n
  const outputTokens: Token[] = []
  fixedOutputs.forEach(output => {
    if (output.lockupScript.kind === "P2PKH") {
      const outputAddress = bs58.encode(codec.lockupScript.lockupScriptCodec.encode(output.lockupScript))
      if (outputAddress === signerAddress) {
        const tokens = output.tokens.map((token) => {
          return {
            id: binToHex(token.tokenId),
            amount: token.amount.toString()
          }
        })
        outputAlph += BigInt(output.amount)
        addTokens(outputTokens, tokens)
      }
    }
  })

  simulatedOutputs.forEach(output => {
    if (output.address === signerAddress) {
      outputAlph += BigInt(output.attoAlphAmount)
      addTokens(outputTokens, output.tokens)
    }
  })

  return [outputAlph, outputTokens]
}

async function swap() {
  web3.setCurrentNodeProvider('https://node.mainnet.alephium.org', undefined, fetch)
  const nodeProvider = web3.getCurrentNodeProvider()
  const signerAddress = "12aH6to1JQxDFsvJ89jtFCnKEcub5ew8x2EABGEDMTYyK"
  const signerPublicKey = "034e30eb5dd78000bcbe276e1202d0dc5499398321cc160cc8b10f2a71ffdfe7ca"

  // Swap 1 ALPH of AYIN
  const result = await TransactionBuilder.from(nodeProvider).buildExecuteScriptTx(
    {
      signerAddress: signerAddress,
      bytecode: "0101030000000f150017620f4cdd77b8e469a5ec08a6744c6334410684a9ee91835ac27ae27f3be3ae144020000000000000000000000000000000000000000000000000000000000000000013c48ac7230489e80000a314402000000000000000000000000000000000000000000000000000000000000000001440201a281053ba8601a658368594da034c2e99a0fb951b86498d05e76aedfe66680013c44413ec31d1261524150017620f4cdd77b8e469a5ec08a6744c6334410684a9ee91835ac27ae27f3be3ae150017620f4cdd77b8e469a5ec08a6744c6334410684a9ee91835ac27ae27f3be3ae1440c40100000000000000007ce66c50e284000002a7ca90b2af892713ed95f23b37a6db00c0650c16bad1ccc601443e9020f89f000100000000000000000de0b6b3a76400000100000000000000000000000000000000000000000000000000000000000000001a281053ba8601a658368594da034c2e99a0fb951b86498d05e76aedfe666800000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000bb813060d1440202f5f4d9bd825a5209a35d396be8be351e6240438bb711121e4453774880dc700010e18",
      attoAlphAmount: "1000000000000000"
    },
    signerPublicKey
  )
  const unsignedTx = codec.unsignedTxCodec.decode(hexToBinUnsafe(result.unsignedTx))
  const fixedInputs = unsignedTx.inputs
  const fixedOutputs = unsignedTx.fixedOutputs
  const simulatedOutputs = result.simulatedOutputs

  // Calculate input ALPH and tokens
  const [inputAlph, inputTokens] = await calculateInputAssets(nodeProvider, fixedInputs, signerAddress)
  // Calculate output ALPH and tokens
  const [outputAlph, outputTokens] = await calculateOutputAssets(fixedOutputs, simulatedOutputs, signerAddress)

  console.log(`Input assets for ${signerAddress}:`)
  console.log(`  ALPH: ${inputAlph}`)
  for (const token of inputTokens) {
    console.log(`  ${token.id}: ${token.amount}`)
  }

  console.log(`Output assets for ${signerAddress}:`)
  console.log(`  ALPH: ${outputAlph}`)
  for (const token of outputTokens) {
    console.log(`  ${token.id}: ${token.amount}`)
  }
}

swap()
