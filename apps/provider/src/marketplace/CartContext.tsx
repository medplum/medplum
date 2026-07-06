// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface CartLineItem {
  itemId: string;
  name: string;
  price: number;
  qty: number;
}

export interface CartContextValue {
  items: CartLineItem[];
  itemCount: number;
  total: number;
  addItem: (item: { itemId: string; name: string; price: number }) => void;
  removeItem: (itemId: string) => void;
  setQty: (itemId: string, qty: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<CartLineItem[]>([]);

  const addItem = useCallback((item: { itemId: string; name: string; price: number }) => {
    setItems((prev) => {
      const existing = prev.find((line) => line.itemId === item.itemId);
      if (existing) {
        return prev.map((line) => (line.itemId === item.itemId ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...prev, { itemId: item.itemId, name: item.name, price: item.price, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((line) => line.itemId !== itemId));
  }, []);

  const setQty = useCallback((itemId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((line) => line.itemId !== itemId);
      }
      return prev.map((line) => (line.itemId === itemId ? { ...line, qty } : line));
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, line) => sum + line.qty, 0);
    const total = items.reduce((sum, line) => sum + line.price * line.qty, 0);
    return { items, itemCount, total, addItem, removeItem, setQty, clear };
  }, [items, addItem, removeItem, setQty, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
