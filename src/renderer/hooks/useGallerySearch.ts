import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'

export function useGallerySearch(debounceMs = 250) {
  const { searchQuery, setSearchQuery } = useUIStore()
  const [inputValue, setInputValue] = useState(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      setSearchQuery(inputValue)
    }, debounceMs)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [inputValue, setSearchQuery, debounceMs])

  return { inputValue, setInputValue, searchQuery }
}
