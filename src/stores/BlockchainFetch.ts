import { action, observable } from 'mobx';
import RootStore from 'stores/Root';
import { supportedChainId } from '../provider/connectors';
import { InputValidationStatus, SwapMethods } from './SwapForm';

export default class BlockchainFetchStore {
    @observable activeFetchLoop: any;
    rootStore: RootStore;

    constructor(rootStore) {
        this.rootStore = rootStore;
    }

    @action blockchainFetch(accountSwitchOverride?: boolean) {
        const { providerStore } = this.rootStore;

        const active = providerStore.providerStatus.active;
        const chainId = providerStore.providerStatus.activeChainId;
        const library = providerStore.providerStatus.library;
        const account = providerStore.providerStatus.account;

        if (active && chainId === supportedChainId && !library._wsReady) {
            library
                .getBlockNumber()
                .then(blockNumber => {
                    const lastCheckedBlock = providerStore.getCurrentBlockNumber();

                    const doFetch =
                        blockNumber !== lastCheckedBlock ||
                        accountSwitchOverride;

                    if (doFetch) {
                        console.log('[Fetch Loop] Fetch Blockchain Data', {
                            blockNumber,
                            chainId,
                            account,
                        });

                        // Set block number
                        providerStore.setCurrentBlockNumber(blockNumber);

                        // Get global blockchain data
                        // None

                        // Get user-specific blockchain data
                        if (account) {
                            providerStore
                                .fetchUserBlockchainData(account)
                                .then(results => {
                                    // Update preview when account changes
                                    if (accountSwitchOverride) {
                                        this.updateSwapPreviewForActiveAccount();
                                    }
                                })
                                .catch(e => {
                                    console.log(e);
                                });
                        }
                    }
                })
                .catch(error => {
                    console.log('[Fetch Loop Failure]', {
                        providerStore,
                        forceFetch: accountSwitchOverride,
                        chainId,
                        account,
                        library,
                        error,
                    });
                    providerStore.setCurrentBlockNumber(undefined);
                });
        }
    }

    updateSwapPreviewForActiveAccount() {
        const { swapFormStore } = this.rootStore;

        const { swapMethod, inputAmount, outputAmount } = swapFormStore.inputs;

        if (swapMethod === SwapMethods.EXACT_IN) {
            const inputStatus = swapFormStore.validateSwapValue(inputAmount);
            if (inputStatus === InputValidationStatus.VALID) {
                swapFormStore.refreshExactAmountInPreview();
            } else {
                swapFormStore.refreshInvalidInputAmount(
                    inputAmount,
                    inputStatus
                );
            }
        } else if (swapMethod === SwapMethods.EXACT_OUT) {
            const inputStatus = swapFormStore.validateSwapValue(outputAmount);
            if (inputStatus === InputValidationStatus.VALID) {
                swapFormStore.refreshExactAmountOutPreview();
            } else {
                swapFormStore.refreshInvalidOutputAmount(
                    outputAmount,
                    inputStatus
                );
            }
        }
    }
}
