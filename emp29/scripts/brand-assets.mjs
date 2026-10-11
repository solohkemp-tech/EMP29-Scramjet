// SPDX-License-Identifier: AGPL-3.0-only
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
await mkdir('public/brand',{recursive:true});
const logo='../brand/EMP29-logo-original.png',hero='../brand/EMP29-hero-original.png';
await sharp(logo).resize(256,256).png({compressionLevel:9}).toFile('public/brand/emp29-logo.png');
await sharp(logo).resize(384,384,{fit:'contain',background:'#0c1114'}).extend({top:64,bottom:64,left:64,right:64,background:'#0c1114'}).flatten({background:'#0c1114'}).png({compressionLevel:9}).toFile('public/icon-512.png');
await sharp('public/icon-512.png').resize(192,192).png({compressionLevel:9}).toFile('public/icon-192.png');
await sharp('public/icon-512.png').resize(32,32).png().toFile('public/favicon.png');
await sharp(hero).resize(960,540,{fit:'cover'}).webp({quality:82,effort:6}).toFile('public/brand/emp29-hero.webp');
console.log('EMP29 brand assets exported from original generated artwork.');
