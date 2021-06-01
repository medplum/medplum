import express from 'express';
import { initApp } from './app';

initApp(express()).listen(5000);
