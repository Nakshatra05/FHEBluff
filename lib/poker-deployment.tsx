'use client';

import {createContext,useContext} from 'react';
import {POKER_ADDRESS,POKER_DEPLOYMENT_BLOCK} from './network';

export const deployments={
  legacy:{address:POKER_ADDRESS,block:POKER_DEPLOYMENT_BLOCK,readiness:false},
  ready:{address:'0x3D3aaFF33c73880e5d7837D24e4c736D7522FDF1' as `0x${string}`,block:306087732n,readiness:true},
};
export type DeploymentVersion=keyof typeof deployments;
export function resolveDeployment(search:string):DeploymentVersion{
  const query=new URLSearchParams(search);
  // Unversioned invitations were issued by the original contract.
  return query.get('version')==='legacy'||(query.has('table')&&query.get('version')!=='ready')?'legacy':'ready';
}
export const PokerDeploymentContext=createContext(deployments.ready);
export const usePokerDeployment=()=>useContext(PokerDeploymentContext);
