import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useStores } from 'contexts/storesContext';
import { useInterval } from 'utils/helperHooks';
import { observer } from 'mobx-react';

import Circle from '../../assets/images/circle.svg';

const MessageWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100vh);
    background-color: var(--panel-background);
`;

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const Spinner = styled.img`
    animation: 2s ${rotate} linear infinite;
    width: 16px;
    height: 16px;
`;

const Web3Manager = observer(({ children }) => {
    const {
        root: { providerStore, blockchainFetchStore },
    } = useStores();

    // handle delayed loader state
    const [showLoader, setShowLoader] = useState(true);
    useEffect(() => {
        const timeout = setTimeout(() => {
            setShowLoader(true);
        }, 600);

        return () => {
            clearTimeout(timeout);
        };
    }, []);

    //Fetch user blockchain data on an interval using current params
    useInterval(() => blockchainFetchStore.blockchainFetch(false), 1000);
    // blockchainFetchStore.blockchainFetch(true);

    // This means no injected web3 and infura backup has failed
    if (!providerStore.providerStatus.active) {
        console.debug('[Web3Manager] Render: No active network, show loading');
        return showLoader ? (
            <MessageWrapper>
                <Spinner src={Circle} />
            </MessageWrapper>
        ) : null;
    }

    return children;
});

export default Web3Manager;
