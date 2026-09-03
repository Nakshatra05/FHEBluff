'use client';

import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { chains } from '@cofhe/sdk/chains';

const cofheConfig = createCofheConfig({ supportedChains: [chains.arbSepolia] });
export const cofheClient = createCofheClient(cofheConfig);
