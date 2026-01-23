import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Favorite {
  id: string;
  type: 'athlete' | 'school' | 'event' | 'meet';
  name: string;
  metadata?: any;
}

interface FavoritesContextType {
  favorites: Favorite[];
  addFavorite: (item: Favorite) => void;
  removeFavorite: (id: string, type: string) => void;
  isFavorite: (id: string, type: string) => boolean;
  getFavoritesByType: (type: string) => Favorite[];
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const addFavorite = (item: Favorite) => {
    setFavorites((prev) => {
      // Don't add duplicates
      if (prev.some((fav) => fav.id === item.id && fav.type === item.type)) {
        return prev;
      }
      return [...prev, item];
    });
  };

  const removeFavorite = (id: string, type: string) => {
    setFavorites((prev) => prev.filter((fav) => !(fav.id === id && fav.type === type)));
  };

  const isFavorite = (id: string, type: string) => {
    return favorites.some((fav) => fav.id === id && fav.type === type);
  };

  const getFavoritesByType = (type: string) => {
    return favorites.filter((fav) => fav.type === type);
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        getFavoritesByType,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
