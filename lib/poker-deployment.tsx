'use client';

import {createContext,useContext} from 'react';
import {POKER_ADDRESS,POKER_DEPLOYMENT_BLOCK} from './network';

export const deployments={
  legacy:{address:POKER_ADDRESS,block:POKER_DEPLOYMENT_BLOCK,readiness:false,version:'legacy' as const},
  ready:{address:'0x3D3aaFF33c73880e5d7837D24e4c736D7522FDF1' as `0x${string}`,block:306087732n,readiness:true,version:'ready' as const},
  instant:{address:'0xBF9d14F5ed0C0fd22102fd38538c1234bB38ACAe' as `0x${string}`,block:306124059n,readiness:false,version:'instant' as const},
};
export type DeploymentVersion=keyof typeof deployments;
export function resolveDeployment(search:string):DeploymentVersion{
  const query=new URLSearchParams(search);
  // Unversioned invitations were issued by the original contract.
  if(!query.has('table'))return 'instant';
  return query.get('version')==='instant'?'instant':query.get('version')==='ready'?'ready':'legacy';
}
export const PokerDeploymentContext=createContext<(typeof deployments)[DeploymentVersion]>(deployments.instant);
export const usePokerDeployment=()=>useContext(PokerDeploymentContext);
