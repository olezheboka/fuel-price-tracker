import * as React from "react"
import { twMerge } from "tailwind-merge"
import { clsx } from "clsx"

const Popover = ({ children }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef(null)

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  // Context-like passing of state to children
  return (
    <div className="relative inline-block" ref={containerRef}>
      {React.Children.map(children, child => {
        if (child.type.displayName === 'PopoverTrigger') {
          return React.cloneElement(child, { isOpen, setIsOpen })
        }
        if (child.type.displayName === 'PopoverContent') {
          return isOpen ? child : null
        }
        return child
      })}
    </div>
  )
}

const PopoverTrigger = ({ children, isOpen, setIsOpen, asChild }) => {
  const handleClick = (e) => {
    e.preventDefault()
    setIsOpen(!isOpen)
  }

  if (asChild) {
    return React.cloneElement(children, {
      onClick: handleClick,
      "aria-expanded": isOpen,
    })
  }

  return (
    <button onClick={handleClick} aria-expanded={isOpen}>
      {children}
    </button>
  )
}
PopoverTrigger.displayName = 'PopoverTrigger'

const PopoverContent = React.forwardRef(({ className, align = "center", children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={twMerge(
        clsx(
          "absolute z-50 mt-2 rounded-xl border border-gray-200 bg-white p-4 text-gray-950 shadow-xl outline-none animate-in fade-in zoom-in-95 duration-200 origin-top-left",
          align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          className
        )
      )}
      style={{ top: '100%' }}
      {...props}
    >
      {children}
    </div>
  )
})
PopoverContent.displayName = 'PopoverContent'

export { Popover, PopoverTrigger, PopoverContent }
