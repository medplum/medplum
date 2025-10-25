// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import NextAuth from 'next-auth';

import { options } from './options';

const handler = NextAuth(options);
export { handler as GET, handler as POST };
