'use client'
import { api } from '@/trpc/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getRetryAfterSeconds } from "@/util/trpc-error"

export default function Countdown({
  duration = 5,
  session = "",
  onCountEnded = () => undefined,
  redirect = '/',
}) {
  const [count, setCount] = useState<number | undefined>(session ? undefined : duration)
  const [retryCount, setRetryCount] = useState<number>()
  const router = useRouter()
  const hasValidated = useRef(false)
  
  const validateOrder = api.order.validate.useMutation({
    onSuccess:(data) => {
      if(data){
        hasValidated.current = true
        setRetryCount(undefined)
        setCount(duration)
      }
    },
    onError: (error) => {
      const retryAfterSeconds = getRetryAfterSeconds(error)
      if (retryAfterSeconds) {
        setRetryCount(retryAfterSeconds)
      }
    },
  }) 

  useEffect(() => {
    if(session && !hasValidated.current){
      hasValidated.current = true
      validateOrder.mutate({session})
    }
  },[session, validateOrder])

  useEffect(() => {
    if (retryCount === undefined) return;
    if (retryCount <= 0) {
      setRetryCount(undefined)
      if (session) {
        validateOrder.mutate({ session })
      }
      return
    }

    const id = setTimeout(() => setRetryCount((current) => (current ?? 0) - 1), 1000)
    return () => clearTimeout(id)
  }, [retryCount, session, validateOrder])

  useEffect(() => {
    if (count !== undefined && count <= 0) {
      onCountEnded?.()
      router.push(redirect)
      return
    }

    const id = setTimeout(() => setCount(c => c && c - 1), 1000)
    return () => clearTimeout(id)
  }, [count, onCountEnded, redirect, router])

  return <span>{count ?? retryCount ?? duration}</span>
}
