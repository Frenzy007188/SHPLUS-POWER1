// Global variables
let currentUser = null
let currentSection = "welcome"
let syncInterval = null
let globalDatabase = null

// Global Database Configuration
const GLOBAL_DB_CONFIG = {
  apiEndpoint: "https://formspree.io/f/mblkywnz",
  syncInterval: 3000, // 3 seconds
  maxRetries: 3,
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeGlobalDatabase()
  setupEventListeners()
  checkSocialLinksAvailability()
  startRealTimeSync()

  // Check if user is logged in
  const savedUser = localStorage.getItem("currentUser")
  if (savedUser) {
    currentUser = JSON.parse(savedUser)
    // Verify user still exists in global database
    verifyUserSession()
  }
})

// Initialize Global Database System
async function initializeGlobalDatabase() {
  try {
    // Create a unique session ID for this browser session
    const sessionId = generateUniqueId()
    localStorage.setItem("sessionId", sessionId)

    // Initialize global database structure
    globalDatabase = {
      users: [],
      globalActivityLog: [],
      referralBonuses: [],
      adminActions: [],
      lastSync: new Date().toISOString(),
      sessionId: sessionId,
    }

    // Load existing data from global storage
    await loadGlobalData()

    console.log("Global Database initialized successfully")
  } catch (error) {
    console.error("Failed to initialize global database:", error)
    // Fallback to local storage
    initializeLocalFallback()
  }
}

// Load data from global storage
async function loadGlobalData() {
  try {
    // Send request to get all global data
    const response = await fetch(GLOBAL_DB_CONFIG.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "GET_GLOBAL_DATA",
        sessionId: localStorage.getItem("sessionId"),
        timestamp: new Date().toISOString(),
      }),
    })

    // For now, we'll use a hybrid approach with localStorage as primary
    // but sync everything to external storage
    const localUsers = JSON.parse(localStorage.getItem("globalUsers") || "[]")
    const localActivityLog = JSON.parse(localStorage.getItem("globalActivityLog") || "[]")

    globalDatabase.users = localUsers
    globalDatabase.globalActivityLog = localActivityLog

    // Also update regular localStorage for compatibility
    localStorage.setItem("users", JSON.stringify(localUsers))
    localStorage.setItem("globalActivityLog", JSON.stringify(localActivityLog))
  } catch (error) {
    console.error("Error loading global data:", error)
  }
}

// Save data to global storage
async function saveGlobalData(data, retryCount = 0) {
  try {
    // Save to our global localStorage keys
    localStorage.setItem("globalUsers", JSON.stringify(globalDatabase.users))
    localStorage.setItem("globalActivityLog", JSON.stringify(globalDatabase.globalActivityLog))

    // Also save to regular localStorage for compatibility
    localStorage.setItem("users", JSON.stringify(globalDatabase.users))
    localStorage.setItem("globalActivityLog", JSON.stringify(globalDatabase.globalActivityLog))

    // Send to external storage
    const payload = {
      action: "SAVE_GLOBAL_DATA",
      sessionId: localStorage.getItem("sessionId"),
      timestamp: new Date().toISOString(),
      data: {
        users: globalDatabase.users,
        globalActivityLog: globalDatabase.globalActivityLog,
        totalUsers: globalDatabase.users.length,
        totalTransactions: globalDatabase.globalActivityLog.length,
      },
      ...data,
    }

    await fetch(GLOBAL_DB_CONFIG.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    // Broadcast to other tabs/windows
    broadcastToOtherTabs("DATA_UPDATED", globalDatabase)
  } catch (error) {
    console.error("Error saving global data:", error)
    if (retryCount < GLOBAL_DB_CONFIG.maxRetries) {
      setTimeout(() => saveGlobalData(data, retryCount + 1), 2000)
    }
  }
}

// Real-time synchronization system
function startRealTimeSync() {
  // Sync every 3 seconds
  syncInterval = setInterval(async () => {
    await syncWithGlobalDatabase()
  }, GLOBAL_DB_CONFIG.syncInterval)

  // Listen for storage changes from other tabs
  window.addEventListener("storage", handleStorageChange)

  // Listen for custom broadcast messages
  window.addEventListener("message", handleBroadcastMessage)

  // Sync when page becomes visible
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncWithGlobalDatabase()
    }
  })
}

// Sync with global database
async function syncWithGlobalDatabase() {
  try {
    // Load latest data from global storage
    const latestUsers = JSON.parse(localStorage.getItem("globalUsers") || "[]")
    const latestActivityLog = JSON.parse(localStorage.getItem("globalActivityLog") || "[]")

    // Check if data has changed
    const usersChanged = JSON.stringify(globalDatabase.users) !== JSON.stringify(latestUsers)
    const logChanged = JSON.stringify(globalDatabase.globalActivityLog) !== JSON.stringify(latestUsers)

    if (usersChanged || logChanged) {
      globalDatabase.users = latestUsers
      globalDatabase.globalActivityLog = latestActivityLog

      // Update current user if logged in
      if (currentUser) {
        const updatedUser = globalDatabase.users.find((u) => u.id === currentUser.id)
        if (updatedUser && JSON.stringify(updatedUser) !== JSON.stringify(currentUser)) {
          currentUser = updatedUser
          localStorage.setItem("currentUser", JSON.stringify(currentUser))

          // Refresh current view
          refreshCurrentView()
        }
      }

      // Refresh admin panel if visible
      if (currentSection === "admin") {
        displayAdminPanel()
      }
    }
  } catch (error) {
    console.error("Sync error:", error)
  }
}

// Handle storage changes from other tabs
function handleStorageChange(e) {
  if (e.key === "globalUsers" || e.key === "globalActivityLog") {
    syncWithGlobalDatabase()
  }
}

// Handle broadcast messages
function handleBroadcastMessage(e) {
  if (e.data && e.data.type === "DATA_UPDATED") {
    syncWithGlobalDatabase()
  }
}

// Broadcast to other tabs
function broadcastToOtherTabs(type, data) {
  // Use BroadcastChannel if available
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("shplus-power")
    channel.postMessage({ type, data })
  }

  // Fallback to localStorage events
  localStorage.setItem(
    "broadcast",
    JSON.stringify({
      type,
      data,
      timestamp: Date.now(),
    }),
  )
  localStorage.removeItem("broadcast")
}

// Refresh current view
function refreshCurrentView() {
  switch (currentSection) {
    case "dashboard":
      updateDashboard()
      break
    case "referrals":
      displayReferrals()
      break
    case "notifications":
      displayNotifications()
      break
    case "active-tasks":
      displayActiveTasks()
      break
  }
}

// Initialize local fallback
function initializeLocalFallback() {
  if (!localStorage.getItem("globalUsers")) {
    localStorage.setItem("globalUsers", JSON.stringify([]))
  }
  if (!localStorage.getItem("globalActivityLog")) {
    localStorage.setItem("globalActivityLog", JSON.stringify([]))
  }

  globalDatabase = {
    users: JSON.parse(localStorage.getItem("globalUsers")),
    globalActivityLog: JSON.parse(localStorage.getItem("globalActivityLog")),
    lastSync: new Date().toISOString(),
  }
}

// Verify user session
async function verifyUserSession() {
  if (currentUser) {
    const globalUsers = JSON.parse(localStorage.getItem("globalUsers") || "[]")
    const userExists = globalUsers.find((u) => u.id === currentUser.id)

    if (userExists) {
      // Update current user with latest data
      currentUser = userExists
      localStorage.setItem("currentUser", JSON.stringify(currentUser))
      showSection("dashboard")
      updateDashboard()
    } else {
      // User doesn't exist in global database, logout
      logout()
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // Mobile menu toggle
  document.getElementById("mobile-menu-btn").addEventListener("click", toggleMobileMenu)

  // Form submissions
  document.getElementById("signup-form").addEventListener("submit", handleSignup)
  document.getElementById("login-form").addEventListener("submit", handleLogin)
  document.getElementById("deposit-form").addEventListener("submit", handleDeposit)
  document.getElementById("withdraw-form").addEventListener("submit", handleWithdraw)
  document.getElementById("admin-login-form").addEventListener("submit", handleAdminLogin)

  // Withdrawal amount calculation
  document.getElementById("withdraw-amount").addEventListener("input", calculateWithdrawalFee)

  // Check for daily profits every minute
  setInterval(checkDailyProfits, 60000)
}

// Navigation functions
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.add("hidden")
  })

  // Show selected section
  document.getElementById(sectionName + "-section").classList.remove("hidden")

  // Update navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active-nav")
  })

  currentSection = sectionName

  // Update content based on section
  switch (sectionName) {
    case "dashboard":
      updateDashboard()
      break
    case "active-tasks":
      displayActiveTasks()
      break
    case "referrals":
      displayReferrals()
      break
    case "notifications":
      displayNotifications()
      break
    case "admin":
      displayAdminPanel()
      break
    case "withdraw":
      updateAvailableBalance()
      break
  }

  // Close mobile menu if open
  closeMobileMenu()
}

function toggleMobileMenu() {
  const sidebar = document.getElementById("sidebar")
  sidebar.classList.toggle("-translate-x-full")
}

function closeMobileMenu() {
  const sidebar = document.getElementById("sidebar")
  sidebar.classList.add("-translate-x-full")
}

// Authentication functions with global sync
async function handleSignup(e) {
  e.preventDefault()

  const name = document.getElementById("signup-name").value
  const email = document.getElementById("signup-email").value
  const phone = document.getElementById("signup-phone").value
  const password = document.getElementById("signup-password").value
  const referralCode = document.getElementById("signup-referral").value

  // Check if user already exists in global database
  if (globalDatabase.users.find((user) => user.email === email)) {
    showNotification("User already exists with this email", "error")
    return
  }

  // Generate unique user ID and account number
  const userId = generateUniqueId()
  const accountNumber = generateAccountNumber()
  const userReferralCode = generateReferralCode()

  // Create new user
  const newUser = {
    id: userId,
    name: name,
    email: email,
    phone: phone,
    password: btoa(password),
    accountNumber: accountNumber,
    balance: 600, // Welcome bonus
    tasks: [],
    transactions: [
      {
        type: "welcome_bonus",
        amount: 600,
        date: new Date().toISOString(),
        description: "Welcome bonus",
      },
    ],
    referrals: [],
    notifications: [
      {
        message: "Welcome to SHPLUS POWER! You received ₦600 welcome bonus.",
        date: new Date().toISOString(),
        type: "success",
      },
    ],
    lastLogin: null,
    referralCode: userReferralCode,
    referredBy: referralCode || null,
    deviceId: getDeviceId(),
    lastUpdate: new Date().toISOString(),
    signupDate: new Date().toISOString(),
  }

  // Add to global database
  globalDatabase.users.push(newUser)

  // Log activity in global log
  const activityLog = {
    id: generateUniqueId(),
    userId: userId,
    action: "signup",
    details: {
      email: email,
      deviceId: getDeviceId(),
      referralCode: referralCode || null,
      signupBonus: 600,
    },
    date: new Date().toISOString(),
    status: "completed",
  }
  globalDatabase.globalActivityLog.push(activityLog)

  // Handle referral if provided - GLOBAL REFERRAL SYSTEM
  if (referralCode) {
    await handleGlobalReferralSignup(referralCode, userId, name)
  }

  // Save to global database
  await saveGlobalData({
    type: "signup",
    name: name,
    email: email,
    phone: phone,
    accountNumber: accountNumber,
    deviceId: getDeviceId(),
    referralCode: referralCode || null,
  })

  showNotification("Account created successfully! Welcome bonus of ₦600 added.", "success")
  showSection("login")
}

// Global referral system that works across ALL devices
async function handleGlobalReferralSignup(referralCode, newUserId, newUserName) {
  // Find referrer in global database
  const referrer = globalDatabase.users.find((u) => u.referralCode === referralCode)
  const newUser = globalDatabase.users.find((u) => u.id === newUserId)

  if (referrer && newUser) {
    // Add ₦600 signup bonus to referrer
    referrer.balance += 600
    referrer.lastUpdate = new Date().toISOString()

    // Add to referrer's referrals list
    referrer.referrals.push({
      userId: newUserId,
      userName: newUserName,
      level: 1,
      joinDate: new Date().toISOString(),
      totalDeposits: 0,
      signupBonus: 600,
    })

    // Add transaction for referrer
    referrer.transactions.push({
      type: "referral_signup_bonus",
      amount: 600,
      date: new Date().toISOString(),
      description: `Referral signup bonus from ${newUserName}`,
      referralUserId: newUserId,
    })

    // Add notification for referrer
    referrer.notifications.push({
      message: `🎉 ${newUserName} signed up using your referral code! You earned ₦600 bonus.`,
      date: new Date().toISOString(),
      type: "success",
    })

    // Handle second level referral
    if (referrer.referredBy) {
      const secondLevelReferrer = globalDatabase.users.find((u) => u.referralCode === referrer.referredBy)
      if (secondLevelReferrer) {
        secondLevelReferrer.referrals.push({
          userId: newUserId,
          userName: newUserName,
          level: 2,
          joinDate: new Date().toISOString(),
          totalDeposits: 0,
          signupBonus: 0,
        })
        secondLevelReferrer.lastUpdate = new Date().toISOString()
      }
    }

    // Log global activity for referral bonus
    globalDatabase.globalActivityLog.push({
      id: generateUniqueId(),
      userId: referrer.id,
      action: "referral_signup_bonus",
      details: {
        amount: 600,
        referredUser: newUserName,
        referredUserId: newUserId,
        deviceId: getDeviceId(),
      },
      date: new Date().toISOString(),
      status: "completed",
    })

    // Save to global database immediately
    await saveGlobalData({
      type: "referral_signup_bonus",
      referrerId: referrer.id,
      referrerName: referrer.name,
      referrerEmail: referrer.email,
      newUserId: newUserId,
      newUserName: newUserName,
      bonusAmount: 600,
      deviceId: getDeviceId(),
    })

    console.log(`Referral bonus processed: ${referrer.name} earned ₦600 for referring ${newUserName}`)
  }
}

async function handleLogin(e) {
  e.preventDefault()

  const email = document.getElementById("login-email").value
  const password = document.getElementById("login-password").value

  // Check in global database
  const user = globalDatabase.users.find((u) => u.email === email && u.password === btoa(password))

  if (!user) {
    showNotification("Invalid email or password", "error")
    return
  }

  // Update last login
  user.lastLogin = new Date().toISOString()
  user.lastUpdate = new Date().toISOString()
  user.deviceId = getDeviceId()
  currentUser = user
  localStorage.setItem("currentUser", JSON.stringify(user))

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === user.id)
  globalDatabase.users[userIndex] = user

  // Save to global database
  await saveGlobalData({
    type: "login",
    userId: user.id,
    email: email,
    deviceId: getDeviceId(),
  })

  // Check for daily profits
  checkDailyProfits()

  showNotification("Login successful!", "success")
  showSection("dashboard")
}

function logout() {
  currentUser = null
  localStorage.removeItem("currentUser")
  showSection("welcome")
  showNotification("Logged out successfully", "success")
}

// Deposit functions with global sync
async function handleDeposit(e) {
  e.preventDefault()

  const amount = Number.parseFloat(document.getElementById("deposit-amount").value)
  const method = document.getElementById("deposit-method").value

  if (amount < 2500) {
    showNotification("Minimum deposit amount is ₦2,500", "error")
    return
  }

  // Store deposit details temporarily
  window.tempDepositData = { amount, method }

  // Show bank details modal
  document.getElementById("deposit-amount-display").textContent = amount.toLocaleString()
  document.getElementById("bank-details-modal").classList.remove("hidden")
}

async function confirmPayment() {
  const { amount, method } = window.tempDepositData

  // Add to user's transactions
  currentUser.transactions.push({
    type: "deposit",
    amount: amount,
    date: new Date().toISOString(),
    description: `Deposit via ${method}`,
    status: "pending",
  })

  // Add notification
  currentUser.notifications.push({
    message: `Deposit of ₦${amount.toLocaleString()} submitted for approval`,
    date: new Date().toISOString(),
    type: "info",
  })

  currentUser.lastUpdate = new Date().toISOString()

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
  globalDatabase.users[userIndex] = currentUser

  // Log in global activity log
  globalDatabase.globalActivityLog.push({
    id: generateUniqueId(),
    userId: currentUser.id,
    action: "deposit",
    details: {
      amount: amount,
      method: method,
      deviceId: getDeviceId(),
      userDevice: navigator.userAgent,
    },
    date: new Date().toISOString(),
    status: "pending",
  })

  // Save to global database
  await saveGlobalData({
    type: "deposit",
    userId: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    accountNumber: currentUser.accountNumber,
    amount: amount,
    method: method,
    bankAccount: "9169386315",
    bankName: "Opay",
    accountName: "Bello Waliyat Shade",
    deviceId: getDeviceId(),
    userDevice: navigator.userAgent,
  })

  // Close modal and reset form
  document.getElementById("bank-details-modal").classList.add("hidden")
  document.getElementById("deposit-form").reset()

  showNotification("Payment confirmation received! Your deposit is pending approval.", "success")
  delete window.tempDepositData
}

function cancelPayment() {
  document.getElementById("bank-details-modal").classList.add("hidden")
  delete window.tempDepositData
  showNotification("Payment cancelled", "info")
}

// Task functions
async function buyTask(name, cost, dailyProfit, duration) {
  if (!currentUser) {
    showNotification("Please log in to buy tasks", "error")
    return
  }

  if (currentUser.balance < cost) {
    showNotification("Insufficient balance to buy this task", "error")
    return
  }

  // Check for pending deposits
  const hasPendingDeposit = currentUser.transactions.some((t) => t.type === "deposit" && t.status === "pending")
  if (hasPendingDeposit) {
    showNotification("Cannot buy tasks while you have pending deposits", "error")
    return
  }

  // Deduct cost from balance
  currentUser.balance -= cost

  // Add task
  const task = {
    id: generateUniqueId(),
    name: name,
    cost: cost,
    dailyProfit: dailyProfit,
    duration: duration,
    startDate: new Date().toISOString(),
    daysLeft: duration,
    totalEarned: 0,
    lastProfitDate: null,
  }

  currentUser.tasks.push(task)

  // Add transaction
  currentUser.transactions.push({
    type: "task_purchase",
    amount: -cost,
    date: new Date().toISOString(),
    description: `Purchased ${name}`,
    taskId: task.id,
  })

  // Add notification
  currentUser.notifications.push({
    message: `Successfully purchased ${name} for ₦${cost.toLocaleString()}`,
    date: new Date().toISOString(),
    type: "success",
  })

  currentUser.lastUpdate = new Date().toISOString()

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
  globalDatabase.users[userIndex] = currentUser

  // Save to global database
  await saveGlobalData({
    type: "task_purchase",
    userId: currentUser.id,
    taskName: name,
    cost: cost,
    deviceId: getDeviceId(),
  })

  updateDashboard()
  showNotification(`Successfully purchased ${name}!`, "success")
}

function displayActiveTasks() {
  const container = document.getElementById("active-tasks-list")

  if (!currentUser || currentUser.tasks.length === 0) {
    container.innerHTML = '<div class="text-center py-8"><p class="text-gray-600">No active tasks found.</p></div>'
    return
  }

  container.innerHTML = currentUser.tasks
    .map((task) => {
      const progress = ((task.duration - task.daysLeft) / task.duration) * 100
      const canCollectProfit = canCollectDailyProfit(task)

      return `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-blue-900">${task.name}</h3>
                        <p class="text-gray-600">Daily Profit: ₦${task.dailyProfit.toLocaleString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-600">Days Left</p>
                        <p class="text-2xl font-bold text-blue-600">${task.daysLeft}</p>
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>${Math.round(progress)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${progress}%"></div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <p class="text-sm text-gray-600">Total Earned</p>
                        <p class="text-lg font-bold text-green-600">₦${task.totalEarned.toLocaleString()}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Purchase Date</p>
                        <p class="text-sm">${new Date(task.startDate).toLocaleDateString()}</p>
                    </div>
                </div>
                
                ${
                  canCollectProfit
                    ? `
                    <button onclick="collectDailyProfit('${task.id}')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Collect Daily Profit (₦${task.dailyProfit.toLocaleString()})
                    </button>
                `
                    : `
                    <button disabled class="w-full bg-gray-400 text-white font-bold py-2 px-4 rounded-lg cursor-not-allowed">
                        Next Profit Available Tomorrow
                    </button>
                `
                }
            </div>
        `
    })
    .join("")
}

function canCollectDailyProfit(task) {
  if (task.daysLeft <= 0) return false

  if (!task.lastProfitDate) return true

  const lastProfit = new Date(task.lastProfitDate)
  const now = new Date()
  const hoursDiff = (now - lastProfit) / (1000 * 60 * 60)

  return hoursDiff >= 24
}

async function collectDailyProfit(taskId) {
  const task = currentUser.tasks.find((t) => t.id === taskId)
  if (!task || !canCollectDailyProfit(task)) return

  // Add profit to balance
  currentUser.balance += task.dailyProfit
  task.totalEarned += task.dailyProfit
  task.daysLeft -= 1
  task.lastProfitDate = new Date().toISOString()

  // Add transaction
  currentUser.transactions.push({
    type: "daily_profit",
    amount: task.dailyProfit,
    date: new Date().toISOString(),
    description: `Daily profit from ${task.name}`,
    taskId: task.id,
  })

  // Add notification
  currentUser.notifications.push({
    message: `Collected ₦${task.dailyProfit.toLocaleString()} daily profit from ${task.name}`,
    date: new Date().toISOString(),
    type: "success",
  })

  currentUser.lastUpdate = new Date().toISOString()

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
  globalDatabase.users[userIndex] = currentUser

  // Save to global database
  await saveGlobalData({
    type: "daily_profit_collected",
    userId: currentUser.id,
    taskId: taskId,
    amount: task.dailyProfit,
    deviceId: getDeviceId(),
  })

  updateDashboard()
  displayActiveTasks()
  showNotification(`Collected ₦${task.dailyProfit.toLocaleString()} daily profit!`, "success")
}

async function checkDailyProfits() {
  if (!currentUser) return

  let profitsCollected = 0

  currentUser.tasks.forEach((task) => {
    if (canCollectDailyProfit(task)) {
      currentUser.balance += task.dailyProfit
      task.totalEarned += task.dailyProfit
      task.daysLeft -= 1
      task.lastProfitDate = new Date().toISOString()

      currentUser.transactions.push({
        type: "daily_profit",
        amount: task.dailyProfit,
        date: new Date().toISOString(),
        description: `Auto-collected daily profit from ${task.name}`,
        taskId: task.id,
      })

      profitsCollected += task.dailyProfit
    }
  })

  if (profitsCollected > 0) {
    currentUser.notifications.push({
      message: `Auto-collected ₦${profitsCollected.toLocaleString()} in daily profits`,
      date: new Date().toISOString(),
      type: "success",
    })

    currentUser.lastUpdate = new Date().toISOString()

    // Update in global database
    const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
    globalDatabase.users[userIndex] = currentUser

    // Save to global database
    await saveGlobalData({
      type: "auto_daily_profits",
      userId: currentUser.id,
      totalCollected: profitsCollected,
      deviceId: getDeviceId(),
    })

    updateDashboard()
  }
}

// Withdrawal functions
async function handleWithdraw(e) {
  e.preventDefault()

  const amount = Number.parseFloat(document.getElementById("withdraw-amount").value)
  const account = document.getElementById("withdraw-account").value
  const bank = document.getElementById("withdraw-bank").value

  if (amount < 600) {
    showNotification("Minimum withdrawal amount is ₦600", "error")
    return
  }

  if (!isWithdrawalTimeValid()) {
    showNotification("Withdrawals are only available between 10:00 AM and 7:00 PM", "error")
    return
  }

  const fee = amount * 0.05
  const totalDeduction = amount + fee

  if (currentUser.balance < totalDeduction) {
    showNotification("Insufficient balance for withdrawal including fees", "error")
    return
  }

  // Deduct amount and fee
  currentUser.balance -= totalDeduction

  // Add transaction
  currentUser.transactions.push({
    type: "withdrawal",
    amount: -amount,
    fee: fee,
    date: new Date().toISOString(),
    description: `Withdrawal to ${bank} (${account})`,
    status: "completed",
  })

  // Add notification
  currentUser.notifications.push({
    message: `Withdrawal of ₦${amount.toLocaleString()} processed (Fee: ₦${fee.toLocaleString()})`,
    date: new Date().toISOString(),
    type: "success",
  })

  currentUser.lastUpdate = new Date().toISOString()

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
  globalDatabase.users[userIndex] = currentUser

  // Log global activity
  globalDatabase.globalActivityLog.push({
    id: generateUniqueId(),
    userId: currentUser.id,
    action: "withdrawal",
    details: { amount: amount, fee: fee, bank: bank, account: account, deviceId: getDeviceId() },
    date: new Date().toISOString(),
    status: "completed",
  })

  // Save to global database
  await saveGlobalData({
    type: "withdrawal",
    userId: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    accountNumber: currentUser.accountNumber,
    amount: amount,
    fee: fee,
    bankAccount: account,
    bankName: bank,
    deviceId: getDeviceId(),
  })

  updateDashboard()

  showModal(
    "Withdrawal Successful",
    `₦${amount.toLocaleString()} has been withdrawn to your account. Fee: ₦${fee.toLocaleString()}`,
  )
  document.getElementById("withdraw-form").reset()
}

function calculateWithdrawalFee() {
  const amount = Number.parseFloat(document.getElementById("withdraw-amount").value) || 0
  const fee = amount * 0.05
  const netAmount = amount - fee

  document.getElementById("fee-amount").textContent = fee.toLocaleString()
  document.getElementById("net-amount").textContent = netAmount.toLocaleString()

  const feeInfo = document.getElementById("withdrawal-fee-info")
  if (amount >= 600) {
    feeInfo.classList.remove("hidden")
  } else {
    feeInfo.classList.add("hidden")
  }
}

function updateAvailableBalance() {
  if (currentUser) {
    document.getElementById("available-balance").textContent = currentUser.balance.toLocaleString()
  }
}

function isWithdrawalTimeValid() {
  const now = new Date()
  const hour = now.getHours()
  return hour >= 10 && hour < 19 // 10 AM to 7 PM
}

// Global referral bonus processing
async function processGlobalReferralBonuses(userId, depositAmount) {
  const user = globalDatabase.users.find((u) => u.id === userId)

  if (!user || !user.referredBy) return

  // First level referral bonus (20%)
  const firstLevelReferrer = globalDatabase.users.find((u) => u.referralCode === user.referredBy)
  if (firstLevelReferrer) {
    const firstLevelBonus = depositAmount * 0.2
    firstLevelReferrer.balance += firstLevelBonus
    firstLevelReferrer.lastUpdate = new Date().toISOString()

    firstLevelReferrer.transactions.push({
      type: "referral_bonus",
      amount: firstLevelBonus,
      date: new Date().toISOString(),
      description: `Level 1 referral bonus from ${user.name}`,
      referralUserId: userId,
    })

    firstLevelReferrer.notifications.push({
      message: `💰 Earned ₦${firstLevelBonus.toLocaleString()} referral bonus (Level 1) from ${user.name}`,
      date: new Date().toISOString(),
      type: "success",
    })

    // Update referral record
    const referralRecord = firstLevelReferrer.referrals.find((r) => r.userId === userId && r.level === 1)
    if (referralRecord) {
      referralRecord.totalDeposits += depositAmount
    }

    // Second level referral bonus (10%)
    if (firstLevelReferrer.referredBy) {
      const secondLevelReferrer = globalDatabase.users.find((u) => u.referralCode === firstLevelReferrer.referredBy)
      if (secondLevelReferrer) {
        const secondLevelBonus = depositAmount * 0.1
        secondLevelReferrer.balance += secondLevelBonus
        secondLevelReferrer.lastUpdate = new Date().toISOString()

        secondLevelReferrer.transactions.push({
          type: "referral_bonus",
          amount: secondLevelBonus,
          date: new Date().toISOString(),
          description: `Level 2 referral bonus from ${user.name}`,
          referralUserId: userId,
        })

        secondLevelReferrer.notifications.push({
          message: `💰 Earned ₦${secondLevelBonus.toLocaleString()} referral bonus (Level 2) from ${user.name}`,
          date: new Date().toISOString(),
          type: "success",
        })

        // Update referral record
        const secondReferralRecord = secondLevelReferrer.referrals.find((r) => r.userId === userId && r.level === 2)
        if (secondReferralRecord) {
          secondReferralRecord.totalDeposits += depositAmount
        }
      }
    }
  }

  // Save to global database
  await saveGlobalData({
    type: "referral_bonuses_processed",
    userId: userId,
    depositAmount: depositAmount,
    deviceId: getDeviceId(),
  })
}

function displayReferrals() {
  if (!currentUser) return

  document.getElementById("referral-code-display").textContent = currentUser.referralCode

  const totalReferrals = currentUser.referrals.length
  const referralEarnings = currentUser.transactions
    .filter((t) => t.type === "referral_bonus" || t.type === "referral_signup_bonus")
    .reduce((sum, t) => sum + t.amount, 0)

  document.getElementById("total-referrals").textContent = totalReferrals
  document.getElementById("referral-earnings").textContent = referralEarnings.toLocaleString()

  const referralsList = document.getElementById("referrals-list")

  if (currentUser.referrals.length === 0) {
    referralsList.innerHTML =
      '<p class="text-gray-600 text-center py-4">No referrals yet. Share your code to start earning!</p>'
    return
  }

  referralsList.innerHTML = currentUser.referrals
    .map((referral) => {
      const referredUser = globalDatabase.users.find((u) => u.id === referral.userId)
      const userName = referredUser ? referredUser.name : referral.userName || "Unknown User"

      return `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium">${userName}</p>
                    <p class="text-sm text-gray-600">Level ${referral.level} • Joined ${new Date(referral.joinDate).toLocaleDateString()}</p>
                    ${referral.signupBonus ? `<p class="text-xs text-green-600">Signup Bonus: ₦${referral.signupBonus}</p>` : ""}
                </div>
                <div class="text-right">
                    <p class="font-bold text-green-600">₦${referral.totalDeposits.toLocaleString()}</p>
                    <p class="text-xs text-gray-600">Total Deposits</p>
                </div>
            </div>
        `
    })
    .join("")
}

function copyReferralCode() {
  const referralCode = currentUser.referralCode
  navigator.clipboard
    .writeText(referralCode)
    .then(() => {
      showNotification("Referral code copied to clipboard!", "success")
    })
    .catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = referralCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      showNotification("Referral code copied to clipboard!", "success")
    })
}

// Notification functions
function displayNotifications() {
  if (!currentUser) return

  const notificationsList = document.getElementById("notifications-list")

  if (currentUser.notifications.length === 0) {
    notificationsList.innerHTML = '<p class="text-gray-600 text-center py-8">No notifications yet.</p>'
    return
  }

  notificationsList.innerHTML = currentUser.notifications
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((notification) => {
      const iconClass =
        notification.type === "success"
          ? "text-green-500 fas fa-check-circle"
          : notification.type === "error"
            ? "text-red-500 fas fa-exclamation-circle"
            : "text-blue-500 fas fa-info-circle"

      return `
                <div class="bg-white rounded-lg shadow p-4 flex items-start space-x-3">
                    <i class="${iconClass} text-xl mt-1"></i>
                    <div class="flex-1">
                        <p class="text-gray-800">${notification.message}</p>
                        <p class="text-sm text-gray-500 mt-1">${new Date(notification.date).toLocaleString()}</p>
                    </div>
                </div>
            `
    })
    .join("")
}

async function clearNotifications() {
  if (!currentUser) return

  currentUser.notifications = []
  currentUser.lastUpdate = new Date().toISOString()

  // Update in global database
  const userIndex = globalDatabase.users.findIndex((u) => u.id === currentUser.id)
  globalDatabase.users[userIndex] = currentUser

  // Save to global database
  await saveGlobalData({
    type: "notifications_cleared",
    userId: currentUser.id,
    deviceId: getDeviceId(),
  })

  displayNotifications()
  showNotification("All notifications cleared", "success")
}

// Admin functions with global database
function showAdminLogin() {
  document.getElementById("admin-login-modal").classList.remove("hidden")
}

function closeAdminLogin() {
  document.getElementById("admin-login-modal").classList.add("hidden")
  document.getElementById("admin-password").value = ""
}

async function handleAdminLogin(e) {
  e.preventDefault()

  const password = document.getElementById("admin-password").value

  if (password === "Admin2.0") {
    closeAdminLogin()
    showSection("admin")

    // Force sync before showing admin panel
    await syncWithGlobalDatabase()
    setTimeout(() => {
      displayAdminPanel()
    }, 500)

    showNotification("Admin access granted", "success")
  } else {
    showNotification("Invalid admin password", "error")
  }
}

function displayAdminPanel() {
  // Use global database for admin panel
  const users = globalDatabase.users
  const globalLog = globalDatabase.globalActivityLog

  // Update admin stats
  const totalUsers = users.length
  const pendingDeposits = globalLog.filter((log) => log.action === "deposit" && log.status === "pending").length
  const approvedDeposits = globalLog.filter((log) => log.action === "deposit" && log.status === "approved").length
  const totalWithdrawals = globalLog.filter((log) => log.action === "withdrawal").length

  document.getElementById("admin-total-users").textContent = totalUsers
  document.getElementById("admin-pending-deposits").textContent = pendingDeposits
  document.getElementById("admin-approved-deposits").textContent = approvedDeposits
  document.getElementById("admin-total-withdrawals").textContent = totalWithdrawals

  // Display activity log
  const activityLog = document.getElementById("admin-activity-log")

  activityLog.innerHTML = globalLog
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((log) => {
      const user = users.find((u) => u.id === log.userId)
      const userName = user ? user.name : "Unknown User"
      const userEmail = user ? user.email : "Unknown Email"
      const deviceInfo = log.details.deviceId ? `Device: ${log.details.deviceId.slice(-6)}` : ""

      const statusClass =
        log.status === "pending"
          ? "text-yellow-600"
          : log.status === "approved"
            ? "text-green-600"
            : log.status === "declined"
              ? "text-red-600"
              : "text-blue-600"

      const actionButtons =
        log.action === "deposit" && log.status === "pending"
          ? `
                <button onclick="approveDeposit('${log.id}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm mr-2">
                    Approve
                </button>
                <button onclick="declineDeposit('${log.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">
                    Decline
                </button>
            `
          : "-"

      return `
                <tr class="border-b">
                    <td class="px-4 py-2">
                        <div>
                            <p class="font-medium">${userName}</p>
                            <p class="text-sm text-gray-600">${userEmail}</p>
                            <p class="text-xs text-gray-500">${deviceInfo}</p>
                        </div>
                    </td>
                    <td class="px-4 py-2 capitalize">${log.action}</td>
                    <td class="px-4 py-2">
                        ${log.details.amount ? "₦" + log.details.amount.toLocaleString() : "-"}
                    </td>
                    <td class="px-4 py-2 text-sm">${new Date(log.date).toLocaleString()}</td>
                    <td class="px-4 py-2">
                        <span class="capitalize ${statusClass} font-medium">${log.status}</span>
                    </td>
                    <td class="px-4 py-2">${actionButtons}</td>
                </tr>
            `
    })
    .join("")
}

async function approveDeposit(logId) {
  const logEntry = globalDatabase.globalActivityLog.find((log) => log.id === logId)
  if (!logEntry || logEntry.status !== "pending") return

  const user = globalDatabase.users.find((u) => u.id === logEntry.userId)
  if (!user) return

  // Update user balance
  user.balance += logEntry.details.amount
  user.lastUpdate = new Date().toISOString()

  // Update transaction status
  const transaction = user.transactions.find(
    (t) => t.type === "deposit" && t.amount === logEntry.details.amount && t.status === "pending",
  )
  if (transaction) {
    transaction.status = "approved"
  }

  // Add notification
  user.notifications.push({
    message: `✅ Deposit of ₦${logEntry.details.amount.toLocaleString()} has been approved`,
    date: new Date().toISOString(),
    type: "success",
  })

  // Process referral bonuses if this is the user's first approved deposit
  const approvedDeposits = user.transactions.filter((t) => t.type === "deposit" && t.status === "approved")
  if (approvedDeposits.length === 1) {
    await processGlobalReferralBonuses(user.id, logEntry.details.amount)
  }

  // Update log status
  logEntry.status = "approved"
  logEntry.approvedBy = "admin"
  logEntry.approvedDate = new Date().toISOString()

  // Save to global database
  await saveGlobalData({
    type: "deposit_approved",
    userId: user.id,
    amount: logEntry.details.amount,
    adminAction: true,
    deviceId: getDeviceId(),
  })

  displayAdminPanel()
  showNotification("Deposit approved successfully", "success")
}

async function declineDeposit(logId) {
  const logEntry = globalDatabase.globalActivityLog.find((log) => log.id === logId)
  if (!logEntry || logEntry.status !== "pending") return

  const user = globalDatabase.users.find((u) => u.id === logEntry.userId)
  if (!user) return

  // Update transaction status
  const transaction = user.transactions.find(
    (t) => t.type === "deposit" && t.amount === logEntry.details.amount && t.status === "pending",
  )
  if (transaction) {
    transaction.status = "declined"
  }

  // Add notification
  user.notifications.push({
    message: `❌ Deposit of ₦${logEntry.details.amount.toLocaleString()} has been declined`,
    date: new Date().toISOString(),
    type: "error",
  })

  // Update log status
  logEntry.status = "declined"
  logEntry.declinedBy = "admin"
  logEntry.declinedDate = new Date().toISOString()

  user.lastUpdate = new Date().toISOString()

  // Save to global database
  await saveGlobalData({
    type: "deposit_declined",
    userId: user.id,
    amount: logEntry.details.amount,
    adminAction: true,
    deviceId: getDeviceId(),
  })

  displayAdminPanel()
  showNotification("Deposit declined", "success")
}

// Dashboard functions
function updateDashboard() {
  if (!currentUser) return

  document.getElementById("user-name-display").textContent = currentUser.name
  document.getElementById("balance-display").textContent = currentUser.balance.toLocaleString()
  document.getElementById("account-number-display").textContent = currentUser.accountNumber
  document.getElementById("active-tasks-count").textContent = currentUser.tasks.length

  const totalEarnings = currentUser.transactions
    .filter((t) => t.type === "daily_profit" || t.type === "referral_bonus")
    .reduce((sum, t) => sum + t.amount, 0)
  document.getElementById("total-earnings-display").textContent = totalEarnings.toLocaleString()

  // Display recent notifications
  const recentNotifications = document.getElementById("recent-notifications")
  const recent = currentUser.notifications.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)

  if (recent.length === 0) {
    recentNotifications.innerHTML = '<p class="text-gray-600">No recent activity</p>'
  } else {
    recentNotifications.innerHTML = recent
      .map(
        (notification) => `
            <div class="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                <i class="fas fa-bell text-blue-500"></i>
                <div class="flex-1">
                    <p class="text-sm">${notification.message}</p>
                    <p class="text-xs text-gray-500">${new Date(notification.date).toLocaleString()}</p>
                </div>
            </div>
        `,
      )
      .join("")
  }
}

// Social media functions
function checkSocialLinksAvailability() {
  const now = new Date()
  const hour = now.getHours()
  const isAvailable = hour >= 10 && hour < 19 // 10 AM to 7 PM

  const whatsappBtn = document.getElementById("whatsapp-btn")
  const telegramBtn = document.getElementById("telegram-btn")

  if (isAvailable) {
    whatsappBtn.disabled = false
    telegramBtn.disabled = false
    whatsappBtn.classList.remove("opacity-50", "cursor-not-allowed")
    telegramBtn.classList.remove("opacity-50", "cursor-not-allowed")
  } else {
    whatsappBtn.disabled = true
    telegramBtn.disabled = true
    whatsappBtn.classList.add("opacity-50", "cursor-not-allowed")
    telegramBtn.classList.add("opacity-50", "cursor-not-allowed")
  }

  // Check every minute
  setTimeout(checkSocialLinksAvailability, 60000)
}

function openWhatsApp() {
  if (isWithdrawalTimeValid()) {
    window.open("https://wa.me/group/shpluspower", "_blank")
  } else {
    showNotification("WhatsApp group is only available between 10:00 AM and 7:00 PM", "error")
  }
}

function openTelegram() {
  if (isWithdrawalTimeValid()) {
    window.open("https://t.me/shpluspower", "_blank")
  } else {
    showNotification("Telegram channel is only available between 10:00 AM and 7:00 PM", "error")
  }
}

// Utility functions
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function generateAccountNumber() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString()
}

function generateReferralCode() {
  return "REF" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase()
}

function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId")
  if (!deviceId) {
    deviceId = generateUniqueId()
    localStorage.setItem("deviceId", deviceId)
  }
  return deviceId
}

function showNotification(message, type = "success") {
  const toast = document.getElementById("notification-toast")
  const toastMessage = document.getElementById("toast-message")

  toastMessage.textContent = message

  // Set color based on type
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg notification z-50 ${
    type === "success" ? "bg-green-500" : type === "error" ? "bg-red-500" : "bg-blue-500"
  } text-white`

  toast.classList.remove("hidden")

  setTimeout(() => {
    toast.classList.add("hidden")
  }, 3000)
}

function showModal(title, message, onConfirm = null) {
  document.getElementById("modal-title").textContent = title
  document.getElementById("modal-message").textContent = message
  document.getElementById("modal").classList.remove("hidden")

  const confirmBtn = document.getElementById("modal-confirm")
  confirmBtn.onclick = () => {
    closeModal()
    if (onConfirm) onConfirm()
  }
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden")
}

function showForgotPassword() {
  showModal(
    "Password Recovery",
    "Please contact support to recover your password. This feature will be available soon.",
  )
}

// Admin URL access functions
function checkAdminAccess() {
  const url = window.location.href
  const hash = window.location.hash

  if (url.includes("/admin") || hash === "#admin") {
    showAdminLogin()
  }
}

// Initialize admin URL checking
document.addEventListener("DOMContentLoaded", () => {
  checkAdminAccess()

  // Listen for hash changes
  window.addEventListener("hashchange", checkAdminAccess)
})
