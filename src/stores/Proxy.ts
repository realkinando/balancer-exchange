import { action, observable } from 'mobx';
import * as helpers from 'utils/helpers';
import {
    bnum,
    printPoolData,
    printSorSwaps,
    printSwapInput,
    printSwaps,
    scale,
} from 'utils/helpers';
import RootStore from 'stores/Root';
import { BigNumber } from 'utils/bignumber';
import * as log from 'loglevel';
import { ContractTypes } from './Provider';
import { SwapMethods } from './SwapForm';
import CostCalculator from '../utils/CostCalculator';
import {
    calcExpectedSlippage,
    calcPrice,
    calcTotalSpotValue,
    findBestSwapsMulti,
} from '../utils/sorWrapper';
import { ethers } from 'ethers';
import { EtherKey } from './Token';

export type SwapPreview = ExactAmountInPreview | ExactAmountOutPreview;

export interface ExactAmountOutPreview {
    tokenAmountOut: BigNumber;
    totalInput: BigNumber | null;
    spotInput: BigNumber | null;
    effectivePrice: BigNumber | null;
    spotPrice: BigNumber | null;
    expectedSlippage: BigNumber | null;
    swaps: any[][];
    sorSwapsFormatted: SorMultiSwap[];
    validSwap: boolean;
    error?: string;
}

export interface ExactAmountInPreview {
    tokenAmountIn: BigNumber;
    totalOutput: BigNumber | null;
    spotOutput: BigNumber | null;
    effectivePrice: BigNumber | null;
    spotPrice: BigNumber | null;
    expectedSlippage: BigNumber | null;
    swaps: any[][];
    sorSwapsFormatted: SorMultiSwap[];
    validSwap: boolean;
    error?: string;
}

export interface SwapInput {
    method: SwapMethods;
    tokenIn: string;
    tokenOut: string;
    tokenAmountIn?: BigNumber;
    tokenAmountOut?: BigNumber;
    minAmountOut?: BigNumber;
    maxAmountIn?: BigNumber;
    maxPrice: BigNumber;
}

export interface Pool {
    id: string;
    decimalsIn: number;
    decimalsOut: number;
    balanceIn: BigNumber;
    balanceOut: BigNumber;
    weightIn: BigNumber;
    weightOut: BigNumber;
    swapFee: BigNumber;
}

export interface MultiSwap {
    pool: string;
    tokenInParam: string;
    tokenOutParam: string;
    maxPrice: string;
    swapAmount: string;
    limitReturnAmount: string;
}

export interface SorMultiSwap {
    sequence: MultiSwap[];
}

export interface SorSwap {
    pool: string;
    amount: BigNumber;
}

export type Swap = {
    pool: string;
    tokenInParam: string;
    tokenOutParam: string;
    maxPrice: string;
};

function printDebugInfo(
    input: SwapInput,
    swaps: Swap[],
    sorSwaps: SorSwap[],
    poolData: Pool[],
    result: BigNumber,
    effectivePrice: BigNumber
) {
    console.log('[Swap Preview]');
    printSwapInput(input);
    printPoolData(poolData);
    printSorSwaps(sorSwaps);
    printSwaps(input.method, swaps);
    console.log('[Result]', {
        result: result.toString(),
        effectivePrice: effectivePrice.toString(),
    });
}

export function emptyExactAmountInPreview(
    inputAmount,
    e?: string
): ExactAmountInPreview {
    return {
        tokenAmountIn: null,
        totalOutput: null,
        spotOutput: null,
        effectivePrice: null,
        spotPrice: null,
        expectedSlippage: null,
        swaps: null,
        sorSwapsFormatted: null,
        validSwap: false,
        error: !!e ? e : undefined,
    };
}

export function emptyExactAmountOutPreview(
    outputAmount,
    e?: string
): ExactAmountOutPreview {
    return {
        tokenAmountOut: null,
        totalInput: null,
        spotInput: null,
        effectivePrice: null,
        spotPrice: null,
        expectedSlippage: null,
        swaps: null,
        sorSwapsFormatted: null,
        validSwap: false,
        error: !!e ? e : undefined,
    };
}

export default class ProxyStore {
    @observable previewPending: boolean;
    costCalculator: CostCalculator;
    rootStore: RootStore;

    constructor(rootStore) {
        this.rootStore = rootStore;
        this.previewPending = false;
        this.costCalculator = new CostCalculator({
            gasPrice: bnum(0),
            gasPerTrade: bnum(0),
            outTokenEthPrice: bnum(0),
        });
    }

    isPreviewPending() {
        return this.previewPending;
    }

    @action setPreviewPending(value) {
        this.previewPending = value;
    }

    /*
        Swap Methods - Action
    */
    @action batchSwapExactIn = async (
        swaps: any[][],
        tokenIn: string,
        tokenAmountIn: BigNumber,
        decimalsIn: number,
        tokenOut: string,
        minAmountOut: BigNumber,
        decimalsOut: number
    ) => {
        const { providerStore, contractMetadataStore } = this.rootStore;
        const proxyAddress = contractMetadataStore.getProxyAddress();

        console.log(`!!!!!!! calling contract ExactIn ${proxyAddress}`);
        console.log(`Token Info: ${tokenIn}->${tokenOut}`);
        swaps.forEach(swap => {
            console.log(swap);
        });
        console.log(swaps);
        console.log(`Amt In: ${tokenAmountIn.toString()}`);
        console.log(`Decimals In: ${decimalsIn}`);
        console.log(`Min Amt Out: ${minAmountOut.toString()}`);
        console.log(`Decimals Out: ${decimalsOut}`);
        /*
        swaps = [
                [ { pool: '0x9302470B18A65D0073E08C79345d8312e2fBE253',
                    tokenIn: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
                    tokenOut: '0xef13C0c8abcaf5767160018d268f9697aE4f5375',
                    swapAmount: '45188110727152342',
                    limitReturnAmount:
                     '10000000000000000000',
                    maxPrice:
                     '10000000000000000000' } ] ]
                     */
        /*
       swaps = [
               ['0x9302470B18A65D0073E08C79345d8312e2fBE253',
                '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
                '0xef13C0c8abcaf5767160018d268f9697aE4f5375',
                '45188110727152342',
                '115792089237316200000000000000000000000000000000000000000000000000000000000000',
                '115792089237316200000000000000000000000000000000000000000000000000000000000000'] ]
                */

        if (tokenIn === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'multihopBatchEthInSwapExactIn',
                [swaps, tokenOut, minAmountOut.toString()],
                {
                    value: ethers.utils.bigNumberify(
                        scale(tokenAmountIn, decimalsIn).toString()
                    ),
                }
            );
        } else if (tokenOut === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'multihopBatchEthOutSwapExactIn',
                [
                    swaps,
                    tokenIn,
                    scale(tokenAmountIn, decimalsIn).toString(),
                    minAmountOut.toString(),
                ]
            );
        } else {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'multihopBatchSwapExactIn',
                [
                    swaps,
                    tokenIn,
                    tokenOut,
                    scale(tokenAmountIn, decimalsIn).toString(),
                    minAmountOut.toString(),
                ]
            );
        }
    };

    @action batchSwapExactOut = async (
        swaps: any[][],
        tokenIn: string,
        maxAmountIn: BigNumber,
        decimalsIn: number,
        tokenOut: string,
        tokenAmountOut: BigNumber,
        decimalsOut: number
    ) => {
        const { providerStore, contractMetadataStore } = this.rootStore;
        const proxyAddress = contractMetadataStore.getProxyAddress();

        console.log(`!!!!!!! calling contract ExactOut`);
        console.log(`Token Info: ${tokenIn}->${tokenOut}`);
        console.log(swaps);
        console.log(`Max In: ${maxAmountIn.toString()}`);
        console.log(`Decimals In: ${decimalsIn}`);
        console.log(`Amt Out: ${tokenAmountOut.toString()}`);
        console.log(`Decimals Out: ${decimalsOut}`);
        /*
        if (tokenIn === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthInSwapExactOut',
                [swaps, tokenOut],
                { value: ethers.utils.bigNumberify(maxAmountIn.toString()) }
            );
        } else if (tokenOut === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthOutSwapExactOut',
                [swaps, tokenIn, maxAmountIn.toString()]
            );
        } else {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchSwapExactOut',
                [swaps, tokenIn, tokenOut, maxAmountIn.toString()]
            );
        }
        */
    };

    calcEffectivePrice(amountIn: BigNumber, amountOut: BigNumber): BigNumber {
        return amountIn.div(amountOut);
    }

    /*
        Swap Methods - Preview
    */
    previewBatchSwapExactIn = async (
        tokenIn: string,
        tokenOut: string,
        inputAmount: BigNumber,
        inputDecimals: number
    ): Promise<ExactAmountInPreview> => {
        try {
            this.setPreviewPending(true);
            const { contractMetadataStore } = this.rootStore;
            console.log(`!!!!!!! ${inputDecimals}`);
            const tokenAmountIn = scale(bnum(inputAmount), inputDecimals);

            let maxPrice = helpers.setPropertyToMaxUintIfEmpty();
            let minAmountOut = helpers.setPropertyToZeroIfEmpty();

            // Use WETH address for Ether
            const tokenInToFind =
                tokenIn === EtherKey
                    ? contractMetadataStore.getWethAddress()
                    : tokenIn;
            const tokenOutToFind =
                tokenOut === EtherKey
                    ? contractMetadataStore.getWethAddress()
                    : tokenOut;

            // returns 0
            const costOutputToken = this.costCalculator.getCostOutputToken();

            const [
                sorSwapsFormatted,
                totalOutput,
                sorSwaps,
            ] = await findBestSwapsMulti(
                tokenInToFind,
                tokenOutToFind,
                SwapMethods.EXACT_IN,
                tokenAmountIn,
                4,
                costOutputToken
            );

            if (sorSwapsFormatted.length === 0) {
                this.setPreviewPending(false);
                return emptyExactAmountInPreview(
                    inputAmount,
                    'Insufficient liquidity on Balancer'
                );
            }

            let spotOutput = await calcTotalSpotValue(
                SwapMethods.EXACT_IN,
                sorSwapsFormatted
            );

            const spotPrice = calcPrice(tokenAmountIn, spotOutput);

            console.log('[Spot Price Calc]', {
                tokenAmountIn: tokenAmountIn.toString(),
                spotOutput: spotOutput.toString(),
            });

            const effectivePrice = this.calcEffectivePrice(
                tokenAmountIn,
                totalOutput
            );

            const expectedSlippage = calcExpectedSlippage(
                spotPrice,
                effectivePrice
            );
            /*
            printDebugInfo(
                {
                    method: SwapMethods.EXACT_IN,
                    tokenIn,
                    tokenOut,
                    tokenAmountIn,
                    maxPrice: bnum(0),
                },
                swaps,
                sorSwaps,
                poolData,
                totalOutput,
                effectivePrice
            );
            */
            this.setPreviewPending(false);
            return {
                tokenAmountIn,
                totalOutput,
                spotOutput,
                effectivePrice,
                spotPrice,
                expectedSlippage,
                swaps: sorSwaps,
                sorSwapsFormatted: sorSwapsFormatted,
                validSwap: true,
            };
        } catch (e) {
            log.error('[Error] previewSwapExactAmountIn', e);
            this.setPreviewPending(false);
            return emptyExactAmountInPreview(inputAmount, e.message);
        }
    };

    previewBatchSwapExactOut = async (
        tokenIn: string,
        tokenOut: string,
        outputAmount: BigNumber,
        outputDecimals: number
    ): Promise<ExactAmountOutPreview> => {
        try {
            this.setPreviewPending(true);
            const { contractMetadataStore } = this.rootStore;

            const tokenAmountOut = scale(bnum(outputAmount), outputDecimals);

            let maxPrice = helpers.setPropertyToMaxUintIfEmpty();
            let maxAmountIn = helpers.setPropertyToMaxUintIfEmpty();

            // Use WETH address for Ether
            const tokenInToFind =
                tokenIn === EtherKey
                    ? contractMetadataStore.getWethAddress()
                    : tokenIn;
            const tokenOutToFind =
                tokenOut === EtherKey
                    ? contractMetadataStore.getWethAddress()
                    : tokenOut;

            const costOutputToken = this.costCalculator.getCostOutputToken();

            const [
                sorSwapsFormatted,
                totalInput,
                sorSwaps,
            ] = await findBestSwapsMulti(
                tokenInToFind,
                tokenOutToFind,
                SwapMethods.EXACT_OUT,
                tokenAmountOut,
                4,
                costOutputToken
            );

            if (sorSwapsFormatted.length === 0) {
                this.setPreviewPending(false);
                return emptyExactAmountOutPreview(
                    outputAmount,
                    'Insufficient liquidity on Balancer'
                );
            }

            console.log(`!!!!!!! ExactAmountOutPreview`);
            console.log(`!!!!!!! ${totalInput.toString()}`);

            const spotInput = await calcTotalSpotValue(
                SwapMethods.EXACT_OUT,
                sorSwapsFormatted
            );

            const spotPrice = calcPrice(tokenAmountOut, spotInput);

            console.log('[Spot Price Calc]', {
                tokenAmountOut: tokenAmountOut.toString(),
                totalInputSpot: spotInput.toString(),
            });

            const effectivePrice = this.calcEffectivePrice(
                tokenAmountOut,
                totalInput
            );

            const expectedSlippage = calcExpectedSlippage(
                effectivePrice,
                spotPrice
            );
            /*
            printDebugInfo(
                {
                    method: SwapMethods.EXACT_OUT,
                    tokenIn,
                    tokenOut,
                    tokenAmountOut,
                    maxPrice: bnum(0),
                },
                swaps,
                sorSwaps,
                poolData,
                totalInput,
                effectivePrice
            );
            */

            if (totalInput.isNaN()) {
                throw new Error('NaN total calculated input');
            }

            this.setPreviewPending(false);
            return {
                tokenAmountOut,
                totalInput,
                spotInput,
                effectivePrice,
                spotPrice,
                expectedSlippage,
                swaps: sorSwaps,
                sorSwapsFormatted: sorSwapsFormatted,
                validSwap: true,
            };
        } catch (e) {
            log.error('[Error] previewSwapExactAmountOut', e);
            this.setPreviewPending(false);
            return emptyExactAmountOutPreview(outputAmount, e.message);
        }
    };
}
