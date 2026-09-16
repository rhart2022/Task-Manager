const SUPABASE_URL = 'https://xyszhsuiamafhrvblpdf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5c3poc3VpYW1hZmhydmJscGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODU5MjksImV4cCI6MjEwNTA2MTkyOX0.VM7qNy2ipcZ2kqi4Wsr_hH6Q8diqRtk4jDw9rqiQgBI';

const authView = document.querySelector('#auth-view');
const appView = document.querySelector('#app-view');
const logoutButton = document.querySelector('#logout-button');
const authMessage = document.querySelector('#auth-message');
const taskMessage = document.querySelector('#task-message');
const tasksElement = document.querySelector('#tasks');
const taskCount = document.querySelector('#task-count');
const taskSort = document.querySelector('#task-sort');
const taskCategoryFilter = document.querySelector('#task-category-filter');
let currentUser = null;
let supabaseClient = null;
let loadedTasks = [];
let calendarDate = new Date();
const editDialog = document.querySelector('#edit-dialog');

function isPlaceholder(value) {
  return !value || value.includes('YOUR-PROJECT') || value.includes('YOUR_SUPABASE');
}

function initializeSupabase() {
  if (isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_ANON_KEY)) {
    const error = new Error('Supabase configuration is missing or still contains placeholder values.');
    console.error('[Supabase configuration error]', error, { SUPABASE_URL, hasAnonKey: Boolean(SUPABASE_ANON_KEY) });
    showMessage(authMessage, 'Add your Supabase URL and anon key in app.js before signing in.', 'error');
    return null;
  }

  try {
    const parsedUrl = new URL(SUPABASE_URL);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error('SUPABASE_URL must be a valid HTTP(S) URL.');
    if (!SUPABASE_ANON_KEY.trim()) throw new Error('SUPABASE_ANON_KEY cannot be empty.');
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error('[Supabase initialization error]', error);
    showMessage(authMessage, `Supabase could not be initialized: ${error.message}`, 'error');
    return null;
  }
}

function showMessage(element, message, type = '') {
  element.textContent = message;
  element.className = `notice ${type}`.trim();
}

function clearMessage(element) {
  element.textContent = '';
  element.className = 'notice hidden';
}

function describeAuthError(error) {
  const text = `${error?.message || ''} ${error?.name || ''}`.toLowerCase();
  if (error instanceof TypeError && text.includes('fetch') || text.includes('failed to fetch') || text.includes('networkerror') || text.includes('cors')) {
    return 'The request could not reach Supabase. Verify the exact Project URL from Project Settings > API, confirm the project is active, then check your internet connection and dashboard URL Configuration/origin settings.';
  }
  if (text.includes('invalid api key') || text.includes('apikey') || text.includes('jwt') || error?.status === 401 || error?.status === 403) {
    return 'Supabase rejected the API credentials. Copy the Project URL and anon public key again from Project Settings > API.';
  }
  return error?.message || 'Authentication failed. Check the browser console for the exact Supabase error.';
}

function handleAuthFailure(error, action) {
  console.error(`[Supabase ${action} error]`, error);
  showMessage(authMessage, describeAuthError(error), 'error');
}

function setAuthenticated(user) {
  currentUser = user;
  const isLoggedIn = Boolean(user);
  authView.classList.toggle('hidden', isLoggedIn);
  appView.classList.toggle('hidden', !isLoggedIn);
  logoutButton.classList.toggle('hidden', !isLoggedIn);
  if (isLoggedIn) {
    document.querySelector('#user-email').textContent = user.email;
    fetchTasks();
  } else {
    tasksElement.innerHTML = '';
    clearMessage(taskMessage);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function renderTasks(tasks) {
  taskCount.textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
  if (!tasks.length) {
    tasksElement.innerHTML = '<p class="empty">Nothing here yet. Add the first thing to your list.</p>';
    return;
  }
  tasksElement.innerHTML = tasks.map((task) => `
    <article class="task ${task.is_completed ? 'completed' : ''}" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" ${task.is_completed ? 'checked' : ''} aria-label="Mark ${escapeHtml(task.title)} as complete" />
      <div><p class="task-title">${escapeHtml(task.title)}</p>${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}<div class="task-meta">${task.category ? `<span class="task-badge category">${escapeHtml(task.category)}</span>` : ''}<span class="task-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'} priority</span>${task.due_date ? `<span class="task-badge due-date">Due ${formatDueDate(task.due_date)}</span>` : ''}</div></div>
      <div class="task-actions"><button class="icon-button edit-task" type="button">Edit</button><button class="icon-button delete-task" type="button">Delete</button></div>
    </article>`).join('');
}

function visibleTasks() {
  if (taskCategoryFilter.value === 'all') return loadedTasks;
  return loadedTasks.filter((task) => task.category === taskCategoryFilter.value);
}

function renderCategoryFilter() {
  const selectedCategory = taskCategoryFilter.value;
  const categories = [...new Set(loadedTasks.map((task) => task.category?.trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second));
  taskCategoryFilter.innerHTML = `<option value="all">All</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  taskCategoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : 'all';
}

function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function renderCalendar() {
  const monthLabel = document.querySelector('#calendar-month');
  const calendarElement = document.querySelector('#calendar');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = toDateKey(new Date());
  monthLabel.textContent = calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  calendarElement.innerHTML = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<span class="calendar-weekday">${day}</span>`).join('');

  for (let dayIndex = 0; dayIndex < 42; dayIndex += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + dayIndex);
    const dateKey = toDateKey(date);
    const dayTasks = loadedTasks.filter((task) => task.due_date === dateKey);
    const dayElement = document.createElement('div');
    dayElement.className = `calendar-day ${date.getMonth() !== month ? 'other-month' : ''} ${dateKey === todayKey ? 'today' : ''}`.trim();
    dayElement.innerHTML = `<span class="calendar-day-number">${date.getDate()}</span>${dayTasks.map((task) => `<button class="calendar-task priority-${task.priority || 'medium'}" type="button" data-task-id="${escapeHtml(task.id)}" title="Edit ${escapeHtml(task.title)}">${escapeHtml(task.title)}</button>`).join('')}`;
    calendarElement.appendChild(dayElement);
  }
}

function formatDueDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortTasks(tasks) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((first, second) => {
    if (taskSort.value === 'priority') return (priorityOrder[first.priority] ?? 1) - (priorityOrder[second.priority] ?? 1);
    if (taskSort.value === 'due_date') {
      if (!first.due_date && !second.due_date) return 0;
      if (!first.due_date) return 1;
      if (!second.due_date) return -1;
      return first.due_date.localeCompare(second.due_date);
    }
    return new Date(second.created_at || 0) - new Date(first.created_at || 0);
  });
}

async function fetchTasks() {
  if (!currentUser || !supabaseClient) return;
  tasksElement.innerHTML = '<p class="loading">Loading your tasks...</p>';
  const { data, error } = await supabaseClient.from('tasks').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  if (error) { console.error('[Supabase fetch tasks error]', error); showMessage(taskMessage, describeAuthError(error), 'error'); return; }
  clearMessage(taskMessage);
  loadedTasks = data || [];
  renderCategoryFilter();
  renderTasks(sortTasks(visibleTasks()));
  renderCalendar();
}

function openEditDialog(task) {
  document.querySelector('#edit-task-title').value = task.title || '';
  document.querySelector('#edit-task-description').value = task.description || '';
  document.querySelector('#edit-task-category').value = task.category || '';
  document.querySelector('#edit-task-priority').value = task.priority || 'medium';
  document.querySelector('#edit-task-due-date').value = task.due_date || '';
  editDialog.dataset.taskId = task.id;
  editDialog.showModal();
}

async function signIn(event) {
  event.preventDefault();
  clearMessage(authMessage);
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: document.querySelector('#login-email').value, password: document.querySelector('#login-password').value });
    if (error) { handleAuthFailure(error, 'signInWithPassword'); return; }
  } catch (error) {
    handleAuthFailure(error, 'signInWithPassword');
  }
}

async function signUp(event) {
  event.preventDefault();
  clearMessage(authMessage);
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email: document.querySelector('#signup-email').value, password: document.querySelector('#signup-password').value });
    if (error) { handleAuthFailure(error, 'signUp'); return; }
    if (data.session) setAuthenticated(data.session.user);
    else showMessage(authMessage, 'Check your email to confirm your account, then log in.', 'success');
  } catch (error) {
    handleAuthFailure(error, 'signUp');
  }
}

supabaseClient = initializeSupabase();
document.querySelector('#login-form').addEventListener('submit', signIn);
document.querySelector('#signup-form').addEventListener('submit', signUp);

document.querySelector('#task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(taskMessage);
  const titleInput = document.querySelector('#task-title');
  const descriptionInput = document.querySelector('#task-description');
  const categoryInput = document.querySelector('#task-category');
  const priorityInput = document.querySelector('#task-priority');
  const dueDateInput = document.querySelector('#task-due-date');
  try {
    const { error } = await supabaseClient.from('tasks').insert({ user_id: currentUser.id, title: titleInput.value.trim(), description: descriptionInput.value.trim(), category: categoryInput.value.trim() || null, priority: priorityInput.value, due_date: dueDateInput.value || null, is_completed: false });
    if (error) { console.error('[Supabase create task error]', error); showMessage(taskMessage, error.message, 'error'); return; }
    event.target.reset();
    await fetchTasks();
  } catch (error) { console.error('[Supabase create task exception]', error); showMessage(taskMessage, describeAuthError(error), 'error'); }
});

taskSort.addEventListener('change', () => renderTasks(sortTasks(visibleTasks())));
taskCategoryFilter.addEventListener('change', () => renderTasks(sortTasks(visibleTasks())));

tasksElement.addEventListener('click', async (event) => {
  const taskElement = event.target.closest('.task');
  if (!taskElement) return;
  const taskId = taskElement.dataset.taskId;
  try {
    if (event.target.classList.contains('delete-task')) {
      const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId).eq('user_id', currentUser.id);
      if (error) throw error;
      await fetchTasks();
    }
    if (event.target.classList.contains('edit-task')) {
      const task = loadedTasks.find((item) => String(item.id) === String(taskId));
      if (task) openEditDialog(task);
    }
  } catch (error) { console.error('[Supabase task mutation error]', error); showMessage(taskMessage, describeAuthError(error), 'error'); }
});

document.querySelector('#calendar').addEventListener('click', (event) => {
  const taskButton = event.target.closest('.calendar-task');
  if (!taskButton) return;
  const task = loadedTasks.find((item) => String(item.id) === String(taskButton.dataset.taskId));
  if (task) openEditDialog(task);
});

document.querySelector('#edit-task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage(taskMessage);
  const taskId = editDialog.dataset.taskId;
  const updates = {
    title: document.querySelector('#edit-task-title').value.trim(),
    description: document.querySelector('#edit-task-description').value.trim(),
    category: document.querySelector('#edit-task-category').value.trim() || null,
    priority: document.querySelector('#edit-task-priority').value,
    due_date: document.querySelector('#edit-task-due-date').value || null
  };
  try {
    const { error } = await supabaseClient.from('tasks').update(updates).eq('id', taskId).eq('user_id', currentUser.id);
    if (error) throw error;
    editDialog.close();
    await fetchTasks();
  } catch (error) { console.error('[Supabase task edit error]', error); showMessage(taskMessage, describeAuthError(error), 'error'); }
});

document.querySelector('#close-edit-dialog').addEventListener('click', () => editDialog.close());
document.querySelector('#cancel-edit').addEventListener('click', () => editDialog.close());
document.querySelector('#previous-month').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector('#next-month').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
});

tasksElement.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('task-check')) return;
  try {
    const taskId = event.target.closest('.task').dataset.taskId;
    const { error } = await supabaseClient.from('tasks').update({ is_completed: event.target.checked }).eq('id', taskId).eq('user_id', currentUser.id);
    if (error) throw error;
    await fetchTasks();
  } catch (error) { console.error('[Supabase completion update error]', error); showMessage(taskMessage, describeAuthError(error), 'error'); await fetchTasks(); }
});

document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => {
  const isLogin = tab.dataset.authTab === 'login';
  document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelector('#login-form').classList.toggle('hidden', !isLogin);
  document.querySelector('#signup-form').classList.toggle('hidden', isLogin);
  clearMessage(authMessage);
}));

logoutButton.addEventListener('click', async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) { console.error('[Supabase signOut error]', error); showMessage(taskMessage, describeAuthError(error), 'error'); }
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => setAuthenticated(session?.user || null));
  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) { console.error('[Supabase getSession error]', error); return; }
    setAuthenticated(data.session?.user || null);
  }).catch((error) => console.error('[Supabase getSession exception]', error));
}
