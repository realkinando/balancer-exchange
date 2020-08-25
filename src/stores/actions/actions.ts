import { Contract } from '@ethersproject/contracts';
import { TransactionResponse } from '@ethersproject/providers';
import { toBuffer } from 'ethereumjs-util';
var abi = require('ethereumjs-abi');

const biconomyID = '78c0c2d7-aa8c-47d2-808f-cc68d22a2dd7';
const biconomyX = '50KmfA5cK.c0d8cd96-4a87-47c9-9f2c-3f046baef8f1';

interface MetaActionRequest {
    contract: Contract;
    action: string;
    sender: string;
    data: any[];
    overrides: any;
    chainId: number;
    account: any;
    provider: any;
}

interface ActionRequest {
    contract: Contract;
    action: string;
    sender: string;
    data: any[];
    overrides: any;
}

export interface ActionResponse {
    contract: Contract;
    action: string;
    sender: string;
    data: object;
    txResponse: any | undefined;
    error: any | undefined;
}

const preLog = params => {
    console.log(`[@action start: ${params.action}]`, {
        contract: params.contract,
        action: params.action,
        sender: params.sender,
        data: params.data,
        overrides: params.overrides,
    });
};

const postLog = (result: ActionResponse) => {
    console.log(`[@action end: ${result.action}]`, {
        contract: result.contract,
        action: result.action,
        sender: result.sender,
        data: result.data,
        result: result.txResponse,
        error: result.error,
    });
};

const getMetaTxData = async (
    contract,
    action: string,
    params: any[],
    chainId,
    account
) => {
    const functionPopulated = await contract.populateTransaction[action](
        ...params
    );
    const functionSignature = functionPopulated.data;
    const nonceBigNo = await contract.nonces(account);
    const nonce = nonceBigNo.toNumber();
    const messageToSign = constructMetaTransactionMessage(
        nonce,
        chainId,
        functionSignature,
        contract.address
    );
    return { functionSignature: functionSignature, message: messageToSign };
};

const constructMetaTransactionMessage = (
    nonce,
    chainId,
    functionSignature,
    contractAddress
) => {
    return abi.soliditySHA3(
        ['uint256', 'address', 'uint256', 'bytes'],
        [nonce, contractAddress, chainId, toBuffer(functionSignature)]
    );
};

const personalSign = async (provider, account, message) => {
    const result = await provider.send('personal_sign', [account, message]);
    const signature = result.substring(2);
    const r = '0x' + signature.substring(0, 64);
    const s = '0x' + signature.substring(64, 128);
    const v = parseInt(signature.substring(128, 130), 16);
    return { r: r, s: s, v: v };
};

export const sendMetaAction = async (
    params: MetaActionRequest
): Promise<ActionResponse> => {
    const {
        contract,
        action,
        sender,
        data,
        overrides,
        chainId,
        account,
        provider,
    } = params;
    preLog(params);

    const actionResponse: ActionResponse = {
        contract,
        action,
        sender,
        data,
        txResponse: undefined,
        error: undefined,
    };
    try {
        const { functionSignature, message } = await getMetaTxData(
            contract,
            action,
            data,
            chainId,
            account
        );
        const { r, s, v } = await personalSign(provider, account, message);
        //replace with fetch API calls
        const metaTxBody = {
            to: contract.address,
            apiId: biconomyID,
            params: [account, functionSignature, r, s, v],
            from: account,
        };
        const biconomy = await fetch(
            'https://api.biconomy.io/api/v2/meta-tx/native',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': biconomyX,
                },
                body: JSON.stringify(metaTxBody),
            }
        );
        if (biconomy.ok) {
            const responseJson = await biconomy.json();
            const txHash = responseJson['txHash'];
            const txObj = { hash: txHash };
            actionResponse.txResponse = txObj;
        } else {
            const responseJson = await biconomy.json();
            throw responseJson;
        }
    } catch (e) {
        actionResponse.error = e;
    }

    postLog(actionResponse);
    return actionResponse;
};

export const sendAction = async (
    params: ActionRequest
): Promise<ActionResponse> => {
    const { contract, action, sender, data, overrides } = params;
    preLog(params);

    const actionResponse: ActionResponse = {
        contract,
        action,
        sender,
        data,
        txResponse: undefined,
        error: undefined,
    };

    try {
        actionResponse.txResponse = await contract[action](...data, overrides);
    } catch (e) {
        actionResponse.error = e;
    }
    postLog(actionResponse);
    return actionResponse;
};
