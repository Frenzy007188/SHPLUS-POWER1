// Global variables
let currentUser = null
let currentSection = "welcome"
let syncInterval = null

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
  setupEventListeners()
  checkSocialLinksAvailability()
  startGlobalSync()

  // Check if user is logged in
  const savedUser = localStorage.getItem("currentUser")
  if (savedUser) {
    currentUser = JSON.parse(savedUser)
    showSection("dashboard")
    updateDashboard()
  }
})

// Initialize localStorage structure with global sync
function initializeApp() {
  // Initialize local storage
  if (!localStorage.getItem("users")) {
    localStorage.setItem("users", JSON.stringify([]))
  }
  if (!localStorage.getItem("globalActivityLog")) {
    localStorage.setItem("globalActivityLog", JSON.stringify([]))
  }

  // Initialize global sync storage
  if (!localStorage.getItem("globalSyncData")) {
    localStorage.setItem(
      "globalSyncData",
      JSON.stringify({
        users: [],
        globalActivityLog: [],
        lastSync: new Date().toISOString(),
        syncId: generateUniqueId(),
      }),
    )
  }

  // Sync data on startup
  syncGlobalData()
}

// Global synchronization system
function startGlobalSync() {
  // Sync every 2 seconds for real-time updates
  syncInterval = setInterval(() => {
    syncGlobalData()
  }, 2000)

  // Also sync when page becomes visible
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncGlobalData()
    }
  })
}

function syncGlobalData() {
  try {
    // Get current global data
    const globalSync = JSON.parse(localStorage.getItem("globalSyncData") || "{}")
    const localUsers = JSON.parse(localStorage.getItem("users") || "[]")
    const localActivityLog = JSON.parse(localStorage.getItem("globalActivityLog") || "[]")

    // Create a master key for cross-device sync
    const masterKey = "SHPLUS_POWER_GLOBAL_DATA"

    // Try to get data from a simulated global storage (using a special localStorage key)
    let masterData = null
    try {
      masterData = JSON.parse(localStorage.getItem(masterKey) || "null")
    } catch (e) {
      masterData = null
    }

    // If no master data exists, create it
    if (!masterData) {
      masterData = {
        users: localUsers,
        globalActivityLog: localActivityLog,
        lastUpdate: new Date().toISOString(),
        version: 1,
      }
      localStorage.setItem(masterKey, JSON.stringify(masterData))
    } else {
      // Merge local changes with master data
      const mergedUsers = mergeUserData(masterData.users, localUsers)
      const mergedActivityLog = mergeActivityLog(masterData.globalActivityLog, localActivityLog)

      // Update master data if there are changes
      if (
        JSON.stringify(mergedUsers) !== JSON.stringify(masterData.users) ||
        JSON.stringify(mergedActivityLog) !== JSON.stringify(masterData.globalActivityLog)
      ) {
        masterData = {
          users: mergedUsers,
          globalActivityLog: mergedActivityLog,
          lastUpdate: new Date().toISOString(),
          version: masterData.version + 1,
        }
        localStorage.setItem(masterKey, JSON.stringify(masterData))
      }

      // Update local storage with master data
      localStorage.setItem("users", JSON.stringify(masterData.users))
      localStorage.setItem("globalActivityLog", JSON.stringify(masterData.globalActivityLog))

      // Update current user if logged in
      if (currentUser) {
        const updatedUser = masterData.users.find((u) => u.id === currentUser.id)
        if (updatedUser && JSON.stringify(updatedUser) !== JSON.stringify(currentUser)) {
          currentUser = updatedUser
          localStorage.setItem("currentUser", JSON.stringify(currentUser))

          // Refresh dashboard if visible
          if (currentSection === "dashboard") {
            updateDashboard()
          }
        }
      }
    }

    // Send data to external sync service (Formspree) for true cross-device sync
    sendSyncDataToServer(masterData)
  } catch (error) {
    console.error("Sync error:", error)
  }
}

function mergeUserData(masterUsers, localUsers) {
  const merged = [...masterUsers]

  localUsers.forEach((localUser) => {
    const existingIndex = merged.findIndex((u) => u.id === localUser.id)
    if (existingIndex >= 0) {
      // Merge user data, keeping the most recent updates
      const existing = merged[existingIndex]
      const localLastUpdate = new Date(
        localUser.lastLogin || localUser.transactions[localUser.transactions.length - 1]?.date || 0,
      )
      const existingLastUpdate = new Date(
        existing.lastLogin || existing.transactions[existing.transactions.length - 1]?.date || 0,
      )

      if (localLastUpdate > existingLastUpdate) {
        merged[existingIndex] = localUser
      }
    } else {
      merged.push(localUser)
    }
  })

  return merged
}

function mergeActivityLog(masterLog, localLog) {
  const merged = [...masterLog]

  localLog.forEach((localEntry) => {
    if (!merged.find((entry) => entry.id === localEntry.id)) {
      merged.push(localEntry)
    }
  })

  return merged.sort((a, b) => new Date(b.date) - new Date(a.date))
}

function sendSyncDataToServer(data) {
  // Send sync data to Formspree for cross-device persistence
  fetch("https://formspree.io/f/mblkywnz", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "global_sync",
      syncData: data,
      timestamp: new Date().toISOString(),
      deviceId: getDeviceId(),
    }),
  }).catch((error) => {
    console.error("Error syncing to server:", error)
  })
}

function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId")
  if (!deviceId) {
    deviceId = generateUniqueId()
    localStorage.setItem("deviceId", deviceId)
  }
  return deviceId
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

// Authentication functions
function handleSignup(e) {
  e.preventDefault()

  const name = document.getElementById("signup-name").value
  const email = document.getElementById("signup-email").value
  const phone = document.getElementById("signup-phone").value
  const password = document.getElementById("signup-password").value
  const referralCode = document.getElementById("signup-referral").value

  // Check if user already exists
  const users = JSON.parse(localStorage.getItem("users"))
  if (users.find((user) => user.email === email)) {
    showNotification("User already exists with this email", "error")
    return
  }

  // Generate unique user ID and account number
  const userId = generateUniqueId()
  const accountNumber = generateAccountNumber()

  // Create new user
  const newUser = {
    id: userId,
    name: name,
    email: email,
    phone: phone,
    password: btoa(password), // Simple Base64 encoding
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
    referralCode: userId,
    referredBy: referralCode || null,
    deviceId: getDeviceId(),
    lastUpdate: new Date().toISOString(),
  }

  // Save user
  users.push(newUser)
  localStorage.setItem("users", JSON.stringify(users))

  // Log activity
  logGlobalActivity(userId, "signup", { email: email, deviceId: getDeviceId() }, "completed")

  // Send to Formspree
  sendToFormspree({
    type: "signup",
    name: name,
    email: email,
    phone: phone,
    accountNumber: accountNumber,
    deviceId: getDeviceId(),
  })

  // Handle referral if provided - THIS WILL NOW WORK ACROSS DEVICES
  if (referralCode) {
    handleReferralSignup(referralCode, userId)
  }

  // Force immediate sync
  syncGlobalData()

  showNotification("Account created successfully! Welcome bonus of ₦600 added.", "success")
  showSection("login")
}

function handleLogin(e) {
  e.preventDefault()

  const email = document.getElementById("login-email").value
  const password = document.getElementById("login-password").value

  const users = JSON.parse(localStorage.getItem("users"))
  const user = users.find((u) => u.email === email && u.password === btoa(password))

  if (!user) {
    showNotification("Invalid email or password", "error")
    return
  }

  // Update last login and check for daily profits
  user.lastLogin = new Date().toISOString()
  user.lastUpdate = new Date().toISOString()
  user.deviceId = getDeviceId()
  currentUser = user
  localStorage.setItem("currentUser", JSON.stringify(user))

  // Update users array
  const userIndex = users.findIndex((u) => u.id === user.id)
  users[userIndex] = user
  localStorage.setItem("users", JSON.stringify(users))

  // Force immediate sync
  syncGlobalData()

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

// Deposit functions - NOW SYNCS ACROSS DEVICES
function handleDeposit(e) {
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

function confirmPayment() {
  const { amount, method } = window.tempDepositData

  // Create deposit record
  const depositId = generateUniqueId()
  const deposit = {
    id: depositId,
    userId: currentUser.id,
    amount: amount,
    method: method,
    date: new Date().toISOString(),
    status: "pending",
    deviceId: getDeviceId(),
  }

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

  // Update user data
  currentUser.lastUpdate = new Date().toISOString()
  updateUserData()

  // Log global activity - THIS WILL BE VISIBLE TO ADMIN ON ANY DEVICE
  logGlobalActivity(
    currentUser.id,
    "deposit",
    {
      amount: amount,
      method: method,
      deviceId: getDeviceId(),
      userDevice: navigator.userAgent,
    },
    "pending",
  )

  // Send to Formspree
  sendToFormspree({
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

  // Force immediate sync so admin sees it instantly
  syncGlobalData()

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
function buyTask(name, cost, dailyProfit, duration) {
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
  updateUserData()
  updateDashboard()

  // Force sync
  syncGlobalData()

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

function collectDailyProfit(taskId) {
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
  updateUserData()
  updateDashboard()
  displayActiveTasks()

  // Force sync
  syncGlobalData()

  showNotification(`Collected ₦${task.dailyProfit.toLocaleString()} daily profit!`, "success")
}

function checkDailyProfits() {
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
    updateUserData()
    updateDashboard()

    // Force sync
    syncGlobalData()
  }
}

// Withdrawal functions
function handleWithdraw(e) {
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

  // Log global activity
  logGlobalActivity(
    currentUser.id,
    "withdrawal",
    { amount: amount, fee: fee, bank: bank, account: account, deviceId: getDeviceId() },
    "completed",
  )

  // Send to Formspree
  sendToFormspree({
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

  currentUser.lastUpdate = new Date().toISOString()
  updateUserData()
  updateDashboard()

  // Force sync
  syncGlobalData()

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

// Referral functions - NOW WORKS ACROSS ALL DEVICES
function handleReferralSignup(referralCode, newUserId) {
  const users = JSON.parse(localStorage.getItem("users"))
  const referrer = users.find((u) => u.referralCode === referralCode)
  const newUser = users.find((u) => u.id === newUserId)

  if (referrer && newUser) {
    // Add ₦600 signup bonus to referrer
    referrer.balance += 600
    referrer.lastUpdate = new Date().toISOString()

    // Add to referrer's referrals list
    referrer.referrals.push({
      userId: newUserId,
      level: 1,
      joinDate: new Date().toISOString(),
      totalDeposits: 0,
    })

    // Add transaction for referrer
    referrer.transactions.push({
      type: "referral_signup_bonus",
      amount: 600,
      date: new Date().toISOString(),
      description: `Referral signup bonus from ${newUser.name}`,
      referralUserId: newUserId,
    })

    // Add notification for referrer
    referrer.notifications.push({
      message: `${newUser.name} signed up using your referral code! You earned ₦600 bonus.`,
      date: new Date().toISOString(),
      type: "success",
    })

    // Find second level referrer
    if (referrer.referredBy) {
      const secondLevelReferrer = users.find((u) => u.referralCode === referrer.referredBy)
      if (secondLevelReferrer) {
        secondLevelReferrer.referrals.push({
          userId: newUserId,
          level: 2,
          joinDate: new Date().toISOString(),
          totalDeposits: 0,
        })
        secondLevelReferrer.lastUpdate = new Date().toISOString()

        const secondLevelIndex = users.findIndex((u) => u.id === secondLevelReferrer.id)
        users[secondLevelIndex] = secondLevelReferrer
      }
    }

    const referrerIndex = users.findIndex((u) => u.id === referrer.id)
    users[referrerIndex] = referrer
    localStorage.setItem("users", JSON.stringify(users))

    // Log global activity for referral bonus
    logGlobalActivity(
      referrer.id,
      "referral_signup_bonus",
      {
        amount: 600,
        referredUser: newUser.name,
        referredUserId: newUserId,
        deviceId: getDeviceId(),
      },
      "completed",
    )

    // Force immediate sync so referrer gets notified on any device
    syncGlobalData()

    // Send notification to Formspree
    sendToFormspree({
      type: "referral_signup_bonus",
      referrerId: referrer.id,
      referrerName: referrer.name,
      referrerEmail: referrer.email,
      newUserId: newUserId,
      newUserName: newUser.name,
      bonusAmount: 600,
      deviceId: getDeviceId(),
    })
  }
}

function processReferralBonuses(userId, depositAmount) {
  const users = JSON.parse(localStorage.getItem("users"))
  const user = users.find((u) => u.id === userId)

  if (!user || !user.referredBy) return

  // First level referral bonus (20%)
  const firstLevelReferrer = users.find((u) => u.referralCode === user.referredBy)
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
      message: `Earned ₦${firstLevelBonus.toLocaleString()} referral bonus (Level 1)`,
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
      const secondLevelReferrer = users.find((u) => u.referralCode === firstLevelReferrer.referredBy)
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
          message: `Earned ₦${secondLevelBonus.toLocaleString()} referral bonus (Level 2)`,
          date: new Date().toISOString(),
          type: "success",
        })

        // Update referral record
        const secondReferralRecord = secondLevelReferrer.referrals.find((r) => r.userId === userId && r.level === 2)
        if (secondReferralRecord) {
          secondReferralRecord.totalDeposits += depositAmount
        }

        const secondLevelIndex = users.findIndex((u) => u.id === secondLevelReferrer.id)
        users[secondLevelIndex] = secondLevelReferrer
      }
    }

    const firstLevelIndex = users.findIndex((u) => u.id === firstLevelReferrer.id)
    users[firstLevelIndex] = firstLevelReferrer
  }

  localStorage.setItem("users", JSON.stringify(users))

  // Force sync so referrers get notified on any device
  syncGlobalData()
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

  const users = JSON.parse(localStorage.getItem("users"))

  referralsList.innerHTML = currentUser.referrals
    .map((referral) => {
      const referredUser = users.find((u) => u.id === referral.userId)
      const userName = referredUser ? referredUser.name : "Unknown User"

      return `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium">${userName}</p>
                    <p class="text-sm text-gray-600">Level ${referral.level} • Joined ${new Date(referral.joinDate).toLocaleDateString()}</p>
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

function clearNotifications() {
  if (!currentUser) return

  currentUser.notifications = []
  currentUser.lastUpdate = new Date().toISOString()
  updateUserData()
  displayNotifications()

  // Force sync
  syncGlobalData()

  showNotification("All notifications cleared", "success")
}

// Admin functions - NOW TRULY GLOBAL
function showAdminLogin() {
  document.getElementById("admin-login-modal").classList.remove("hidden")
}

function closeAdminLogin() {
  document.getElementById("admin-login-modal").classList.add("hidden")
  document.getElementById("admin-password").value = ""
}

function handleAdminLogin(e) {
  e.preventDefault()

  const password = document.getElementById("admin-password").value

  if (password === "Admin2.0") {
    closeAdminLogin()
    showSection("admin")

    // Force sync before showing admin panel
    syncGlobalData()
    setTimeout(() => {
      displayAdminPanel()
    }, 500)

    showNotification("Admin access granted", "success")
  } else {
    showNotification("Invalid admin password", "error")
  }
}

function displayAdminPanel() {
  // Force sync to get latest data
  syncGlobalData()

  const users = JSON.parse(localStorage.getItem("users"))
  const globalLog = JSON.parse(localStorage.getItem("globalActivityLog"))

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

function approveDeposit(logId) {
  const globalLog = JSON.parse(localStorage.getItem("globalActivityLog"))
  const users = JSON.parse(localStorage.getItem("users"))

  const logEntry = globalLog.find((log) => log.id === logId)
  if (!logEntry || logEntry.status !== "pending") return

  const user = users.find((u) => u.id === logEntry.userId)
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
    message: `Deposit of ₦${logEntry.details.amount.toLocaleString()} has been approved`,
    date: new Date().toISOString(),
    type: "success",
  })

  // Process referral bonuses if this is the user's first approved deposit
  const approvedDeposits = user.transactions.filter((t) => t.type === "deposit" && t.status === "approved")
  if (approvedDeposits.length === 1) {
    processReferralBonuses(user.id, logEntry.details.amount)
  }

  // Update log status
  logEntry.status = "approved"
  logEntry.approvedBy = "admin"
  logEntry.approvedDate = new Date().toISOString()

  // Save updates
  const userIndex = users.findIndex((u) => u.id === user.id)
  users[userIndex] = user
  localStorage.setItem("users", JSON.stringify(users))
  localStorage.setItem("globalActivityLog", JSON.stringify(globalLog))

  // Force immediate sync so user sees approval on any device
  syncGlobalData()

  displayAdminPanel()
  showNotification("Deposit approved successfully", "success")
}

function declineDeposit(logId) {
  const globalLog = JSON.parse(localStorage.getItem("globalActivityLog"))
  const users = JSON.parse(localStorage.getItem("users"))

  const logEntry = globalLog.find((log) => log.id === logId)
  if (!logEntry || logEntry.status !== "pending") return

  const user = users.find((u) => u.id === logEntry.userId)
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
    message: `Deposit of ₦${logEntry.details.amount.toLocaleString()} has been declined`,
    date: new Date().toISOString(),
    type: "error",
  })

  // Update log status
  logEntry.status = "declined"
  logEntry.declinedBy = "admin"
  logEntry.declinedDate = new Date().toISOString()

  user.lastUpdate = new Date().toISOString()

  // Save updates
  const userIndex = users.findIndex((u) => u.id === user.id)
  users[userIndex] = user
  localStorage.setItem("users", JSON.stringify(users))
  localStorage.setItem("globalActivityLog", JSON.stringify(globalLog))

  // Force immediate sync
  syncGlobalData()

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

function updateUserData() {
  if (!currentUser) return

  const users = JSON.parse(localStorage.getItem("users"))
  const userIndex = users.findIndex((u) => u.id === currentUser.id)

  if (userIndex !== -1) {
    users[userIndex] = currentUser
    localStorage.setItem("users", JSON.stringify(users))
    localStorage.setItem("currentUser", JSON.stringify(currentUser))
  }
}

function logGlobalActivity(userId, action, details, status) {
  const globalLog = JSON.parse(localStorage.getItem("globalActivityLog"))

  const logEntry = {
    id: generateUniqueId(),
    userId: userId,
    action: action,
    details: details,
    date: new Date().toISOString(),
    status: status,
  }

  globalLog.push(logEntry)
  localStorage.setItem("globalActivityLog", JSON.stringify(globalLog))
}

function sendToFormspree(data) {
  fetch("https://formspree.io/f/mblkywnz", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).catch((error) => {
    console.error("Error sending to Formspree:", error)
  })
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

// Initialize the app when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // App is already initialized in the main DOMContentLoaded listener
  })
}
